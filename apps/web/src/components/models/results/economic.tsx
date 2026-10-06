'use client';

import type { ProjectModel } from '@roshd/financial-engine';
import {
  costBenefitIndicators,
  costBenefitIndirect,
  costBenefitLevelsTable,
  costBenefitTable,
  economicScheduleOfWarning,
  employmentTable,
  foreignExchangeTable,
  foreignExchangeTests,
  matrixNumber,
  valueAddedTable,
  valueAddedTests,
  type EconomicFigure,
  type EconomicScheduleKey,
  type MatrixTable,
} from '@roshd/financial-report/economic';
import { unitLabel } from '@roshd/financial-report/indicators';
import { formatDecimalFa } from '@roshd/financial-report/numbers';
import type { StatementTable } from '@roshd/financial-report/tables';
import {
  indicatorOfWarning,
  unique,
  warningMessage,
  type Warning,
} from '@roshd/financial-report/warnings';
import { cn, Notice } from '@roshd/ui';
import { NUMERAIRE_LABELS_FA, type ReportingUnit } from '@roshd/validation';
import { Fragment, type ReactNode } from 'react';
import { IndicatorCard } from './indicator-card';

type Economic = NonNullable<ProjectModel['economic']>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The economic analysis of a stored run (ST-37.05; comfar-model-spec §6): value added, net
 * foreign-exchange effect, employment and the cost-benefit analysis at economic prices, each with
 * the engine's warnings about it. A run has a schedule only when its input asks for it and its
 * engine already produced it; what is missing is said in words.
 */
export function EconomicPart({
  economic,
  unit,
  label,
  currency,
  warnings,
  schedule,
}: {
  economic: ProjectModel['economic'];
  unit: ReportingUnit;
  /** The display unit of amounts in local currency, e.g. «میلیون IRR». */
  label: string;
  /** The local currency of the run. */
  currency: string;
  warnings: Warning[];
  /** Renders a table with one column per period, in the given unit of amounts. */
  schedule: (build: () => StatementTable, unitLabel?: string) => ReactNode;
}) {
  if (!isRecord(economic)) {
    return (
      <>
        <h2 className="sr-only">تحلیل اقتصادی</h2>
        <Notice>
          این اجرا تحلیل اقتصادی ندارد. برای دیدن جدول‌های ارزش افزوده، اثر ارزی، اشتغال و
          هزینه-فایده، در ویرایشگر مدل بخش «تحلیل اقتصادی» را کامل کنید و اجرای تازه‌ای ثبت کنید.
        </Notice>
      </>
    );
  }
  const { valueAdded, foreignExchange, employment, costBenefit } = economic as Economic;
  const about = (key: EconomicScheduleKey) =>
    unique(warnings.filter((w) => economicScheduleOfWarning(w) === key).map(warningMessage));
  // A run of an older engine, or one whose input leaves the part out, has no such schedule.
  const missing = [
    isRecord(foreignExchange) ? '' : 'اثر ارزی',
    isRecord(employment) ? '' : 'اشتغال',
    isRecord(costBenefit) ? '' : 'هزینه-فایده',
  ].filter((name) => name !== '');
  return (
    <>
      <h2 className="sr-only">تحلیل اقتصادی</h2>
      <Section title="ارزش افزوده">
        {schedule(() => valueAddedTable(valueAdded))}
        <Figures
          title="آزمون‌های کارایی (به ارزش فعلی)"
          figures={valueAddedTests(valueAdded)}
          unit={unit}
        />
        <Warnings items={about('valueAdded')} />
      </Section>
      {isRecord(foreignExchange) ? (
        <Section title="اثر ارزی">
          {schedule(() => foreignExchangeTable(foreignExchange))}
          <Figures
            title="کارایی ارزی"
            figures={foreignExchangeTests(foreignExchange)}
            unit={unit}
          />
          <Warnings items={about('foreignExchange')} />
        </Section>
      ) : null}
      {isRecord(employment) ? (
        <Section title="اشتغال">
          <MatrixTableView
            table={employmentTable(employment, unit, label)}
            unit={unit}
            unitLabel={label}
          />
          <Warnings items={about('employment')} />
        </Section>
      ) : null}
      {isRecord(costBenefit) ? (
        <CostBenefitSection
          analysis={costBenefit}
          unit={unit}
          local={currency}
          schedule={schedule}
        />
      ) : null}
      {missing.length > 0 ? (
        <p className="text-[13px] leading-7 text-ink-3">
          در این اجرا نیست: {missing.join('، ')}. هر جدول وقتی ساخته می‌شود که ورودی آن در بخش
          «تحلیل اقتصادی» مدل وارد شده باشد و اجرا با نسخه‌ای از موتور محاسبه ثبت شده باشد که آن
          جدول را دارد.
        </p>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6 first-of-type:border-t-0 first-of-type:pt-0">
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Warnings({ items }: { items: string[] }) {
  return items.length > 0 ? (
    <Notice>
      <ul className="list-disc ps-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Notice>
  ) : null;
}

function Figures({
  title,
  figures,
  unit,
  unitLabel: label = '',
}: {
  title: string;
  figures: EconomicFigure[];
  unit: ReportingUnit;
  /** Unit of the amounts among the figures. */
  unitLabel?: string;
}) {
  return (
    <div className="rounded-card bg-surface p-4">
      <h4 className="mb-3 text-[15px] font-bold text-ink">{title}</h4>
      <dl className="flex flex-col gap-2 text-sm">
        {figures.map((figure) => {
          const number =
            figure.value === undefined
              ? null
              : matrixNumber({ value: figure.value, kind: figure.kind }, unit);
          return (
            <div key={figure.label} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
              <dt className="text-ink-3">{figure.label}</dt>
              <dd className="font-bold text-ink">
                {number === null ? (
                  'ندارد'
                ) : (
                  <>
                    <bdi dir="ltr">{formatDecimalFa(number)}</bdi>
                    {figure.kind === 'amount' && label ? ` ${label}` : ''}
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function CostBenefitSection({
  analysis,
  unit,
  local,
  schedule,
}: {
  analysis: NonNullable<Economic['costBenefit']>;
  unit: ReportingUnit;
  local: string;
  schedule: (build: () => StatementTable, unitLabel?: string) => ReactNode;
}) {
  // The analysis is in its numeraire, which may be a foreign currency.
  const label = unitLabel(unit, analysis.currency);
  const levels = costBenefitIndicators(analysis);
  return (
    <Section title="هزینه-فایده به قیمت‌های اقتصادی">
      <p className="text-sm leading-7 text-ink-3">
        واحد سنجش: {NUMERAIRE_LABELS_FA[analysis.numeraire] ?? analysis.numeraire}
        {analysis.currency !== local ? (
          <>
            {' '}
            (<bdi dir="ltr">{analysis.currency}</bdi>)
          </>
        ) : null}
        . همه مبلغ‌های این قسمت ارزش فعلی با نرخ تنزیل اقتصادی و به {label} است. شاخص‌های سطح آخر،
        ارزش فعلی خالص و نرخ بازده داخلی اقتصادی طرح‌اند.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {levels.map((level) => (
          <div key={level.key} className="flex flex-col gap-2">
            <IndicatorCard
              nested
              title={level.title}
              unit={unit}
              unitLabel={label}
              values={{ npv: level.npv, irr: level.irr }}
              rows={['npv', 'irr']}
              warnings={level.warnings.flatMap((warning) => {
                const indicator = indicatorOfWarning(warning);
                return indicator ? [{ indicator, text: warningMessage(warning) }] : [];
              })}
            />
            {level.startingBalance === undefined ? null : (
              <p className="text-[13px] leading-6 text-ink-3">
                مانده آغازین شرکت موجود که پیش از دوره اول منظور شده است:{' '}
                <bdi dir="ltr">
                  {formatDecimalFa(
                    matrixNumber({ value: level.startingBalance, kind: 'amount' }, unit) ?? '',
                  )}
                </bdi>{' '}
                {label}
              </p>
            )}
          </div>
        ))}
      </div>
      <MatrixTableView table={costBenefitTable(analysis)} unit={unit} unitLabel={label} />
      <Figures
        title="آثار غیرمستقیم به ارزش اقتصادی"
        figures={costBenefitIndirect(analysis)}
        unit={unit}
        unitLabel={label}
      />
      {schedule(() => costBenefitLevelsTable(analysis), label)}
    </Section>
  );
}

/** A read-only table with its own columns: a line per row, a measure or a case per column. */
function MatrixTableView({
  table,
  unit,
  unitLabel: label,
}: {
  table: MatrixTable;
  unit: ReportingUnit;
  unitLabel: string;
}) {
  // A line that is not one value per column is not shown as if the rest were empty.
  for (const row of table.sections.flatMap((section) => section.rows)) {
    if (row.cells.length !== table.head.length)
      throw new Error(`unexpected shape of «${row.label}»`);
  }
  return (
    <div
      role="region"
      aria-label={table.title}
      tabIndex={0}
      className="relative overflow-x-auto rounded-card border border-line"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="border-b border-line bg-surface px-3 py-2 text-start text-[15px] font-bold text-ink">
          {table.title}
          {label ? (
            <span className="ms-2 text-xs font-normal text-ink-3">(مبلغ‌ها به {label})</span>
          ) : null}
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky start-0 z-10 min-w-56 bg-surface px-3 py-2 text-start font-semibold text-ink-3"
            >
              {table.corner}
            </th>
            {table.head.map((heading) => (
              <th
                key={heading}
                scope="col"
                className="bg-surface px-3 py-2 text-end font-semibold whitespace-nowrap text-ink-3"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.sections.map((section, s) => (
            <Fragment key={s}>
              {section.title ? (
                <tr className="border-t border-line">
                  <th
                    colSpan={table.head.length + 1}
                    className="bg-paper px-3 pt-3 pb-1 text-start text-[13px] font-bold text-ink-3"
                  >
                    <span className="sticky start-3">{section.title}</span>
                  </th>
                </tr>
              ) : null}
              {section.rows.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th
                    scope="row"
                    className={cn(
                      'sticky start-0 z-10 bg-paper px-3 py-1.5 text-start text-ink',
                      row.strong ? 'font-bold' : 'font-normal',
                    )}
                  >
                    {row.label}
                  </th>
                  {row.cells.map((cell, col) => {
                    const number = matrixNumber(cell, unit);
                    return (
                      <td
                        key={col}
                        className={cn(
                          'px-3 py-1.5 text-end whitespace-nowrap text-ink',
                          row.strong && 'font-bold',
                        )}
                      >
                        <bdi dir="ltr">{number === null ? '—' : formatDecimalFa(number)}</bdi>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
