'use client';

import type { ProjectModel } from '@roshd/financial-engine';
import {
  Button,
  cn,
  ErrorMessage,
  FieldShell,
  formatDateTimeFa,
  Notice,
  Select,
  SuccessMessage,
  Tag,
  toPersianDigits,
} from '@roshd/ui';
import {
  projectInputSchema,
  REPORTING_UNIT_LABELS_FA,
  REPORTING_UNITS,
  type ReportingUnit,
} from '@roshd/validation';
import { Component, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';
import { frameOfHorizon } from '@/lib/model-editor/frame';
import { getIn, textAt } from '@/lib/model-editor/paths';
import {
  balanceSheetTable,
  cashFlowTable,
  discountedCashFlowTable,
  DISCOUNTED_TITLES_FA,
  incomeStatementTable,
  ratiosTable,
  tableColumns,
  type StatementTable,
} from '@roshd/financial-report/tables';
import {
  BASIS_LABELS_FA,
  defaultText,
  unique,
  warningMessage,
  warningPlace,
  warningText,
  type Basis,
} from '@roshd/financial-report/warnings';
import type { CalculationRunDetail } from '../types';
import { ScenarioPanel, SensitivityPanel } from './analysis';
import { CumulativeChart } from './charts';
import { RunDownloads } from './downloads';
import {
  amountText,
  indicatorText,
  percentText,
  unitLabel,
} from '@roshd/financial-report/indicators';
import { IncrementalPanel } from './incremental';
import { IndicatorCard } from './indicator-card';
import { StatementTableView } from './statement-table';

const TABS = [
  ['summary', 'خلاصه و شاخص‌ها'],
  ['income', 'سود و زیان'],
  ['cash', 'جریان نقد'],
  ['balance', 'ترازنامه'],
  ['discounted', 'جریان نقدی تنزیل‌شده'],
  ['ratios', 'نسبت‌ها'],
  ['analysis', 'سناریو و حساسیت'],
  ['incremental', 'تحلیل افزایشی'],
] as const;
type TabId = (typeof TABS)[number][0];

const BASES: Basis[] = ['totalCapital', 'equity'];

function isModel(value: unknown): value is ProjectModel {
  const statements = (value as { statements?: unknown } | null)?.statements;
  return statements !== null && typeof statements === 'object';
}

const UNREADABLE =
  'نتایج این اجرا با این نسخه از برنامه قابل نمایش نیست. از ورودی‌های مدل اجرای تازه‌ای ثبت کنید.';

/**
 * A stored run is never changed, so it may be older than this page: results with another shape
 * end here with a plain message instead of a broken page or partial figures.
 */
class ResultsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? <ErrorMessage>{UNREADABLE}</ErrorMessage> : this.props.children;
  }
}

/**
 * A stored calculation run (ST-34.08): its indicators with the engine's warnings next to the
 * indicator they are about, the schedules as tables, the cumulative cash flow as a chart, and
 * scenarios and sensitivity calculated in the browser on the run's own input.
 */
export function RunView({
  modelId,
  run,
  onChanged,
}: {
  modelId: string;
  run: CalculationRunDetail;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<TabId>('summary');
  // The incremental analysis loads lists of models and runs: only once its part is opened.
  const [incrementalOpened, setIncrementalOpened] = useState(false);
  const select = (id: TabId) => {
    setTab(id);
    if (id === 'incremental') setIncrementalOpened(true);
  };
  const [unit, setUnit] = useState<ReportingUnit>('1');
  const [approval, setApproval] = useState<{ busy: boolean; error?: string; done?: boolean }>({
    busy: false,
  });
  const tabsId = useId();
  const unitId = useId();

  // The tables need the horizon and the currency of the snapshot only; the analyses need the
  // whole input as this version of the engine reads it.
  const input = useMemo(() => {
    const parsed = projectInputSchema.safeParse(run.input);
    return parsed.success ? parsed.data : null;
  }, [run.input]);
  const frame = useMemo(() => frameOfHorizon(getIn(run.input, ['horizon'])), [run.input]);
  const model = isModel(run.results) ? run.results : null;

  if (!frame || !model) return <ErrorMessage>{UNREADABLE}</ErrorMessage>;

  const { statements } = model;
  const currency = textAt(run.input, ['localCurrency']);
  const label = unitLabel(unit, currency);

  const approve = async () => {
    if (!window.confirm('تأیید اجرا قابل بازگشت نیست و اجرا را قفل می‌کند. تأیید می‌کنید؟')) return;
    setApproval({ busy: true });
    const result = await apiFetch(`/financial-models/${modelId}/runs/${run.id}/approval`, {
      method: 'POST',
    });
    setApproval(result.ok ? { busy: false, done: true } : { busy: false, error: result.message });
    // Also after a refusal: the run may have been approved by someone else meanwhile.
    onChanged();
  };

  const moveTab = (event: KeyboardEvent<HTMLDivElement>) => {
    const ids = TABS.map(([id]) => id);
    const current = ids.indexOf(tab);
    // Tabs read right to left: the next one is on the left.
    const next =
      event.key === 'ArrowLeft'
        ? (current + 1) % ids.length
        : event.key === 'ArrowRight'
          ? (current - 1 + ids.length) % ids.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? ids.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    const id = ids[next] ?? 'summary';
    select(id);
    document.getElementById(`${tabsId}-tab-${id}`)?.focus();
  };

  const schedule = (build: () => StatementTable) => (
    <Schedule build={build} frame={frame} unit={unit} unitLabel={label} />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-ink-3">زمان محاسبه</dt>
          <dd>{formatDateTimeFa(run.createdAt)}</dd>
          <dt className="text-ink-3">نسخه ورودی‌های مدل</dt>
          <dd>{toPersianDigits(run.modelVersion)}</dd>
          <dt className="text-ink-3">نسخه موتور محاسبه</dt>
          <dd dir="ltr" className="text-right">
            {run.engineVersion}
          </dd>
          <dt className="text-ink-3">اثر انگشت ورودی</dt>
          <dd dir="ltr" className="text-right font-mono text-[13px]" title={run.inputHash}>
            {run.inputHash.slice(0, 16)}…
          </dd>
          <dt className="text-ink-3">وضعیت</dt>
          <dd>
            {run.approvedAt ? (
              <Tag className="border-success-line text-success-fg">
                تأییدشده در {formatDateTimeFa(run.approvedAt)}
              </Tag>
            ) : (
              <Tag>تأییدنشده</Tag>
            )}
          </dd>
        </dl>
        <div className="flex flex-wrap items-end gap-3">
          <FieldShell id={unitId} label="واحد نمایش مبلغ‌ها">
            <Select
              id={unitId}
              value={unit}
              onChange={(event) => setUnit(event.target.value as ReportingUnit)}
            >
              {REPORTING_UNITS.map((option) => (
                <option key={option} value={option}>
                  {option === '1' ? currency : `${REPORTING_UNIT_LABELS_FA[option]} ${currency}`}
                </option>
              ))}
            </Select>
          </FieldShell>
          {run.canApprove ? (
            <Button size="xl" disabled={approval.busy} onClick={() => void approve()}>
              {approval.busy ? 'در حال ثبت…' : 'تأیید این اجرا'}
            </Button>
          ) : null}
        </div>
      </div>
      {approval.error ? <ErrorMessage>{approval.error}</ErrorMessage> : null}
      {approval.done ? <SuccessMessage>این اجرا تأیید و قفل شد.</SuccessMessage> : null}
      <RunDownloads modelId={modelId} runId={run.id} unit={unit} />

      <div
        role="tablist"
        aria-label="بخش‌های نتیجه"
        onKeyDown={moveTab}
        className="relative flex gap-2 overflow-x-auto border-b border-line pb-px"
      >
        {TABS.map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${tabsId}-tab-${id}`}
            aria-selected={id === tab}
            aria-controls={`${tabsId}-panel`}
            tabIndex={id === tab ? 0 : -1}
            onClick={() => select(id)}
            className={cn(
              'shrink-0 rounded-t-control border-b-2 px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors',
              id === tab
                ? 'border-primary text-ink'
                : 'border-transparent text-ink-3 hover:text-ink',
            )}
          >
            {text}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-tab-${tab}`}
        className="flex flex-col gap-6"
      >
        <ResultsBoundary key={tab}>
          {tab === 'summary' ? (
            <SummaryPart
              statements={statements}
              frame={frame}
              unit={unit}
              label={label}
              warnings={run.warnings}
              defaultsUsed={run.defaultsUsed}
            />
          ) : null}
          {tab === 'income' ? schedule(() => incomeStatementTable(statements)) : null}
          {tab === 'cash' ? schedule(() => cashFlowTable(statements)) : null}
          {tab === 'balance' ? schedule(() => balanceSheetTable(statements)) : null}
          {tab === 'discounted'
            ? BASES.map((basis) => (
                <div key={basis}>{schedule(() => discountedCashFlowTable(statements, basis))}</div>
              ))
            : null}
          {tab === 'ratios' ? schedule(() => ratiosTable(statements)) : null}
        </ResultsBoundary>
        {/* Kept on the page while another part is open: what was typed and calculated stays. */}
        <div hidden={tab !== 'analysis'} className="flex flex-col gap-6">
          <h2 className="sr-only">سناریو و حساسیت</h2>
          {input ? (
            <>
              <ScenarioPanel input={input} unit={unit} unitLabel={label} />
              <div className="border-t border-line pt-6">
                <SensitivityPanel input={input} unit={unit} unitLabel={label} />
              </div>
            </>
          ) : (
            <Notice>
              ورودی‌های این اجرا با این نسخه از برنامه خوانده نمی‌شود؛ سناریو و حساسیت برای آن در
              دسترس نیست. از ورودی‌های مدل اجرای تازه‌ای ثبت کنید.
            </Notice>
          )}
        </div>
        <div hidden={tab !== 'incremental'} className="flex flex-col gap-6">
          {!incrementalOpened ? null : input ? (
            <IncrementalPanel
              modelId={modelId}
              run={run}
              model={model}
              input={input}
              frame={frame}
              unit={unit}
              unitLabel={label}
            />
          ) : (
            <Notice>
              ورودی‌های این اجرا با این نسخه از برنامه خوانده نمی‌شود؛ تحلیل افزایشی برای آن در
              دسترس نیست. از ورودی‌های مدل اجرای تازه‌ای ثبت کنید.
            </Notice>
          )}
        </div>
      </div>
    </div>
  );
}

type Frame = NonNullable<ReturnType<typeof frameOfHorizon>>;

/** One schedule; it reads the stored result while it renders, inside `ResultsBoundary`. */
function Schedule({
  build,
  frame,
  unit,
  unitLabel: label,
}: {
  build: () => StatementTable;
  frame: Frame;
  unit: ReportingUnit;
  unitLabel: string;
}) {
  const table = build();
  const columns = tableColumns(frame, table.salvageColumn, table.openingColumn);
  // A line that is not one value per column is not shown as if the rest were empty.
  for (const row of table.sections.flatMap((section) => section.rows)) {
    if (!Array.isArray(row.values) || row.values.length !== columns.length) {
      throw new Error(`unexpected shape of «${row.label}»`);
    }
  }
  return <StatementTableView table={table} columns={columns} unit={unit} unitLabel={label} />;
}

function SummaryPart({
  statements,
  frame,
  unit,
  label,
  warnings,
  defaultsUsed,
}: {
  statements: ProjectModel['statements'];
  frame: Frame;
  unit: ReportingUnit;
  label: string;
  warnings: CalculationRunDetail['warnings'];
  defaultsUsed: CalculationRunDetail['defaultsUsed'];
}) {
  // Stored with the run like its results, and read here for the same reason: a shape this page
  // does not know ends in the boundary's message, not in a broken page.
  const placed = warnings.flatMap((warning) => {
    const place = warningPlace(warning);
    return place ? [{ ...place, text: warningMessage(warning) }] : [];
  });
  const general = unique(
    warnings.filter((warning) => warningPlace(warning) === null).map(warningText),
  );
  const defaults = unique(defaultsUsed.map(defaultText));
  return (
    <>
      <h2 className="sr-only">خلاصه و شاخص‌ها</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {BASES.map((basis) => (
          <IndicatorCard
            key={basis}
            title={BASIS_LABELS_FA[basis]}
            unit={unit}
            unitLabel={label}
            values={{
              npv: statements[basis].npv,
              irr: statements[basis].irr,
              mirr: statements[basis].mirr,
              paybackMonths: statements[basis].payback?.months,
              dynamicPaybackMonths: statements[basis].dynamicPayback?.months,
              ...(basis === 'totalCapital'
                ? { npvRatio: statements.totalCapital.npvRatio?.ratio }
                : {}),
            }}
            rows={[
              'npv',
              'irr',
              'mirr',
              'payback',
              'dynamicPayback',
              ...(basis === 'totalCapital' ? (['npvRatio'] as const) : []),
            ]}
            warnings={placed.filter((warning) => warning.basis === basis)}
          />
        ))}
      </div>
      <OtherIndicators statements={statements} frame={frame} />
      {general.length > 0 ? (
        <Notice>
          <p className="font-bold">هشدارهای محاسبه</p>
          <ul className="list-disc ps-5">
            {general.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {defaults.length > 0 ? (
        <p className="text-[13px] leading-7 text-ink-3">
          پیش‌فرض‌های COMFAR که در این اجرا به کار رفت: {defaults.join('؛ ')}.
        </p>
      ) : null}
      {BASES.map((basis) => (
        <CumulativeChart
          key={basis}
          title={`نمودار جریان نقد تجمعی ${BASIS_LABELS_FA[basis]}`}
          description={`جریان نقد خالص تجمعی و ارزش فعلی تجمعی ${BASIS_LABELS_FA[basis]} در هر دوره، به ${label}. ارقام این نمودار در جدول زیر آن و در جدول «${DISCOUNTED_TITLES_FA[basis]}» آمده است.`}
          columns={tableColumns(frame, statements[basis].salvageColumn)}
          series={[
            {
              label: `جریان نقد خالص تجمعی ${BASIS_LABELS_FA[basis]}`,
              values: statements[basis].cumulative,
            },
            {
              label: 'ارزش فعلی تجمعی',
              values: statements[basis].cumulativePresentValue,
              dashed: true,
            },
          ]}
          format={(value) => `${amountText(value, unit)} ${label}`}
        />
      ))}
    </>
  );
}

function OtherIndicators({
  statements,
  frame,
}: {
  statements: ProjectModel['statements'];
  frame: NonNullable<ReturnType<typeof frameOfHorizon>>;
}) {
  const { breakEven, debtService } = statements;
  const year = frame.productionYears[breakEven.selectedYear];
  const minimum = debtService?.minimum;
  const period = minimum ? frame.periods[minimum.period] : undefined;
  return (
    <section className="rounded-card bg-surface p-4">
      <h3 className="mb-3 text-[15px] font-bold text-ink">سربه‌سر و پوشش بدهی</h3>
      <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-3">
            فروش سربه‌سر به فروش برنامه{year ? ` (${year.group}، با هزینه مالی)` : ''}
          </dt>
          <dd className="font-bold text-ink">
            {percentText(breakEven.selected.includingFinance.breakEvenRatio)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-3">
            کمترین نسبت پوشش خدمت بدهی{period ? ` (${period.group} ${period.label})` : ''}
          </dt>
          <dd className="font-bold text-ink">
            {minimum
              ? indicatorText('npvRatio', { npv: '0', npvRatio: minimum.ratio }, '1')
              : 'ندارد'}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[13px] text-ink-3">
        «ندارد» یعنی آن شاخص برای این طرح قابل محاسبه نیست: یا دلیلش در هشدارها آمده است، یا طرح
        چنین موردی (مثلاً تسهیلات بلندمدت) ندارد.
      </p>
    </section>
  );
}
