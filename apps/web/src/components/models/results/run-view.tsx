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
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { apiFetch } from '@/lib/api-client';
import { frameOfHorizon } from '@/lib/model-editor/frame';
import {
  balanceSheetTable,
  cashFlowTable,
  discountedCashFlowTable,
  DISCOUNTED_TITLES_FA,
  incomeStatementTable,
  ratiosTable,
  tableColumns,
} from '@/lib/model-editor/statements';
import {
  BASIS_LABELS_FA,
  defaultText,
  unique,
  warningMessage,
  warningPlace,
  warningText,
  type Basis,
  type IndicatorKey,
} from '@/lib/model-editor/warnings';
import type { CalculationRunDetail } from '../types';
import { ScenarioPanel, SensitivityPanel } from './analysis';
import { CumulativeChart } from './charts';
import {
  amountText,
  INDICATOR_LABELS_FA,
  indicatorText,
  percentText,
  unitLabel,
  type IndicatorRowKey,
  type IndicatorValues,
} from './format';
import { StatementTableView } from './statement-table';

const TABS = [
  ['summary', 'خلاصه و شاخص‌ها'],
  ['income', 'سود و زیان'],
  ['cash', 'جریان نقد'],
  ['balance', 'ترازنامه'],
  ['discounted', 'جریان نقدی تنزیل‌شده'],
  ['ratios', 'نسبت‌ها'],
  ['analysis', 'سناریو و حساسیت'],
] as const;
type TabId = (typeof TABS)[number][0];

const BASES: Basis[] = ['totalCapital', 'equity'];

function isModel(value: unknown): value is ProjectModel {
  const statements = (value as { statements?: unknown } | null)?.statements;
  return statements !== null && typeof statements === 'object';
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
  const [unit, setUnit] = useState<ReportingUnit>('1');
  const [approval, setApproval] = useState<{ busy: boolean; error?: string; done?: boolean }>({
    busy: false,
  });
  const tabsId = useId();
  const unitId = useId();

  const input = useMemo(() => {
    const parsed = projectInputSchema.safeParse(run.input);
    return parsed.success ? parsed.data : null;
  }, [run.input]);
  const frame = useMemo(() => frameOfHorizon(input?.horizon), [input]);
  const model = isModel(run.results) ? run.results : null;

  if (!input || !frame || !model) {
    return (
      <ErrorMessage>
        نتایج این اجرا با این نسخه از برنامه قابل نمایش نیست. از ورودی‌های مدل اجرای تازه‌ای ثبت
        کنید.
      </ErrorMessage>
    );
  }

  const { statements } = model;
  const currency = input.localCurrency;
  const label = unitLabel(unit, currency);
  const placed = run.warnings.flatMap((warning) => {
    const place = warningPlace(warning);
    return place ? [{ ...place, text: warningMessage(warning) }] : [];
  });
  const general = unique(
    run.warnings.filter((warning) => warningPlace(warning) === null).map(warningText),
  );
  const defaults = unique(run.defaultsUsed.map(defaultText));

  const approve = async () => {
    if (!window.confirm('تأیید اجرا قابل بازگشت نیست و اجرا را قفل می‌کند. تأیید می‌کنید؟')) return;
    setApproval({ busy: true });
    const result = await apiFetch(`/financial-models/${modelId}/runs/${run.id}/approval`, {
      method: 'POST',
    });
    if (result.ok) {
      setApproval({ busy: false, done: true });
      onChanged();
    } else {
      setApproval({ busy: false, error: result.message });
    }
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
    setTab(id);
    document.getElementById(`${tabsId}-tab-${id}`)?.focus();
  };

  const table = (which: ReturnType<typeof incomeStatementTable>) => (
    <StatementTableView
      table={which}
      columns={tableColumns(frame, which.salvageColumn)}
      unit={unit}
      unitLabel={label}
    />
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
            onClick={() => setTab(id)}
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
        {tab === 'summary' ? (
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
                description={`جریان نقد خالص تجمعی و ارزش فعلی تجمعی ${BASIS_LABELS_FA[basis]} در هر دوره، به ${label}. ارقام این نمودار در جدول «${DISCOUNTED_TITLES_FA[basis]}» در بخش «جریان نقدی تنزیل‌شده» آمده است.`}
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
        ) : null}
        {tab === 'income' ? table(incomeStatementTable(statements)) : null}
        {tab === 'cash' ? table(cashFlowTable(statements)) : null}
        {tab === 'balance' ? table(balanceSheetTable(statements)) : null}
        {tab === 'discounted'
          ? BASES.map((basis) => (
              <div key={basis}>{table(discountedCashFlowTable(statements, basis))}</div>
            ))
          : null}
        {tab === 'ratios' ? table(ratiosTable(statements)) : null}
        {tab === 'analysis' ? (
          <>
            <h2 className="sr-only">سناریو و حساسیت</h2>
            <ScenarioPanel input={input} unit={unit} />
            <div className="border-t border-line pt-6">
              <SensitivityPanel input={input} unit={unit} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function IndicatorCard({
  title,
  values,
  rows,
  warnings,
  unit,
  unitLabel: label,
}: {
  title: string;
  values: IndicatorValues;
  rows: IndicatorRowKey[];
  warnings: { indicator: IndicatorKey; text: string }[];
  unit: ReportingUnit;
  unitLabel: string;
}) {
  return (
    <section className="rounded-card bg-surface p-4">
      <h3 className="mb-3 text-[15px] font-bold text-ink">{title}</h3>
      <dl className="flex flex-col gap-2 text-sm">
        {rows.map((row) => {
          const notes = unique(
            warnings.filter((warning) => warning.indicator === row).map((w) => w.text),
          );
          return (
            <div key={row} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
              <dt className="text-ink-3">{INDICATOR_LABELS_FA[row]}</dt>
              <dd className="font-bold text-ink">
                {indicatorText(row, values, unit)}
                {row === 'npv' && label ? ` ${label}` : ''}
              </dd>
              {notes.map((note) => (
                <dd key={note} className="col-span-2 mt-1 text-[13px] leading-6 text-notice-fg">
                  {note}
                </dd>
              ))}
            </div>
          );
        })}
      </dl>
    </section>
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
        «ندارد» یعنی آن شاخص برای این طرح قابل محاسبه نیست؛ دلیلش کنار همان شاخص آمده است.
      </p>
    </section>
  );
}
