import type {
  CostBenefitLevel,
  CostBenefitLine,
  CostBenefitSchedule,
  EconomicLine,
  EconomicShareLine,
  EmploymentLine,
  EmploymentSchedule,
  ForeignExchangeSchedule,
  ValueAddedSchedule,
} from '@roshd/financial-engine';
import type { ReportingUnit } from '@roshd/validation';
import { roundDecimal, roundSignificant, shiftDecimal } from './numbers';
import {
  cellNumber,
  type RowKind,
  type StatementRow,
  type StatementSection,
  type StatementTable,
} from './tables';
import type { Warning } from './warnings';

/**
 * The schedules of the economic analysis of a stored run as tables (ST-37.05; manual X.D,
 * comfar-model-spec §6): value added, net foreign-exchange effect, employment and the cost-benefit
 * analysis at economic prices. The values are the engine's own; nothing is summed here.
 */

/** A line per project period with its total and its present value as the last two columns. */
const amount = (label: string, line: EconomicLine, strong = false): StatementRow => ({
  label,
  values: [...line.values, line.total, line.presentValue],
  kind: 'amount',
  ...(strong ? { strong } : {}),
});

const share = (label: string, line: EconomicShareLine): StatementRow => ({
  label,
  values: [...line.values, line.total, line.presentValue],
  kind: 'percent',
});

export function valueAddedTable(schedule: ValueAddedSchedule): StatementTable {
  const { valueOfOutput, investment, repatriated, distribution, government } = schedule;
  return {
    id: 'value-added',
    title: 'ارزش افزوده طرح',
    totalColumns: true,
    sections: [
      {
        title: 'ارزش ستانده و نهاده‌ها',
        rows: [
          amount(
            'درآمد ناخالص فروش (با مالیات فروش، بدون یارانه)',
            valueOfOutput.grossSalesRevenue,
          ),
          amount('سایر درآمدها', valueOfOutput.otherIncome),
          amount('ارزش ستانده', valueOfOutput.total, true),
          amount(
            'مواد و خدمات مصرف‌شده (خالص از مالیات و ارزش افزوده داخل آن)',
            schedule.materialInput,
          ),
          amount('ارزش افزوده ناخالص داخلی', schedule.grossDomesticValueAdded, true),
        ],
      },
      {
        title: 'سرمایه‌گذاری',
        rows: [
          amount(
            'سرمایه‌گذاری ثابت و هزینه‌های قبل از بهره‌برداری',
            investment.fixedAndPreProduction,
          ),
          amount('افزایش موجودی‌ها', investment.inventoryIncrease),
          amount('جمع سرمایه‌گذاری', investment.total, true),
          amount('ارزش افزوده خالص داخلی', schedule.netDomesticValueAdded, true),
        ],
      },
      {
        title: 'پرداخت‌های منتقل‌شده به خارج',
        rows: [
          amount('دستمزد', repatriated.wages),
          amount('سود سهام', repatriated.dividends),
          amount('سود و کارمزد تسهیلات', repatriated.interest),
          amount('سایر', repatriated.others),
          amount('جمع پرداخت‌های منتقل‌شده به خارج', repatriated.total, true),
          amount('ارزش افزوده خالص ملی', schedule.netNationalValueAdded, true),
        ],
      },
      {
        title: 'توزیع ارزش افزوده خالص ملی',
        rows: [
          amount('دستمزد داخلی', distribution.domesticWages),
          amount('از آن: نیروی ماهر', distribution.skilledLabour),
          amount('از آن: نیروی ساده', distribution.unskilledLabour),
          amount('سود سهام و سود تسهیلات', distribution.dividendsAndInterest),
          amount('دولت', distribution.government),
          amount('سایر (سود تقسیم‌نشده و مانند آن)', distribution.others),
        ],
      },
      {
        title: 'سهم هر بخش از ارزش افزوده خالص ملی',
        rows: [
          share('دستمزد داخلی', distribution.shares.domesticWages),
          share('سود سهام و سود تسهیلات', distribution.shares.dividendsAndInterest),
          share('دولت', distribution.shares.government),
          share('سایر', distribution.shares.others),
        ],
      },
      {
        title: 'اجزای سهم دولت',
        rows: [
          amount('مالیات بر درآمد', government.incomeTax),
          amount('مالیات فروش', government.salesTax),
          amount('مالیات و عوارض داخل قیمت نهاده‌ها و مالیات سود سهام', government.indirectTaxes),
          amount('یارانه فروش (کسر می‌شود)', government.salesSubsidies),
          amount('کمک‌ها و یارانه‌های داخلی تأمین مالی (کسر می‌شود)', government.grants),
          amount('یارانه نهاده‌ها (کسر می‌شود)', government.inputSubsidies),
        ],
      },
    ],
  };
}

/** A figure beside a schedule: its name and its value, absent when it cannot be calculated. */
export interface EconomicFigure {
  label: string;
  value: string | undefined;
  kind: MatrixKind;
}

/** The efficiency tests of the value added, at present value. */
export const valueAddedTests = (schedule: ValueAddedSchedule): EconomicFigure[] => [
  {
    label: 'آزمون کارایی مطلق: ارزش افزوده خالص ملی به دستمزد داخلی (پذیرفته از ۱ به بالا)',
    value: schedule.efficiency.absolute,
    kind: 'factor',
  },
  {
    label: 'ارزش افزوده خالص ملی به سرمایه‌گذاری',
    value: schedule.efficiency.perInvestment,
    kind: 'factor',
  },
  {
    label: 'ارزش افزوده خالص ملی به دستمزد نیروی ماهر',
    value: schedule.efficiency.perSkilledLabour,
    kind: 'factor',
  },
];

export function foreignExchangeTable(schedule: ForeignExchangeSchedule): StatementTable {
  const { inflows, outflows, indirect } = schedule;
  return {
    id: 'foreign-exchange',
    title: 'اثر ارزی خالص طرح',
    totalColumns: true,
    sections: [
      {
        title: 'ورود ارز',
        rows: [
          amount('آورده خارجی', inflows.equity),
          amount('تسهیلات خارجی (برداشت و سود انباشته)', inflows.loans),
          amount('کمک‌ها و یارانه‌های خارجی', inflows.grants),
          amount('درآمد صادرات', inflows.exports),
          amount('جمع ورود ارز', inflows.total, true),
        ],
      },
      {
        title: 'خروج ارز',
        rows: [
          amount('سرمایه‌گذاری با منشأ خارجی', outflows.investment),
          amount('مواد و خدمات با منشأ خارجی', outflows.materials),
          amount('بازپرداخت اصل تسهیلات خارجی', outflows.debtService.repayment),
          amount('سود و کارمزد تسهیلات خارجی', outflows.debtService.interest),
          amount('جمع خدمت بدهی خارجی', outflows.debtService.total),
          amount('دستمزد پرداختی به خارج', outflows.wages),
          amount('بازپرداخت آورده خارجی', outflows.equityRefunds),
          amount('سود سهام منتقل‌شده به خارج (پس از مالیات)', outflows.dividends),
          amount('سایر (هزینه‌های دیگر و افزایش سرمایه در گردش با منشأ خارجی)', outflows.others),
          amount('جمع خروج ارز', outflows.total, true),
          amount('خالص جریان ارزی', schedule.netFlow, true),
        ],
      },
      {
        title: 'آثار غیرمستقیم: ورود ارز',
        rows: [
          amount('صرفه‌جویی ارزی ستانده‌های جانشین واردات', indirect.inflows.importableOutputs),
          amount('درآمد ارزی ستانده‌های قابل صادرات', indirect.inflows.exportableOutputs),
          amount('سایر منافع ارزی', indirect.inflows.others),
          amount('جمع ورود غیرمستقیم', indirect.inflows.total, true),
        ],
      },
      {
        title: 'آثار غیرمستقیم: خروج ارز',
        rows: [
          amount('واردات ناشی از نهاده‌های جانشین واردات', indirect.outflows.importableInputs),
          amount('صادرات ازدست‌رفته نهاده‌های قابل صادرات', indirect.outflows.exportableInputs),
          amount('سایر هزینه‌های ارزی', indirect.outflows.others),
          amount('جمع خروج غیرمستقیم', indirect.outflows.total, true),
          amount('خالص آثار غیرمستقیم', indirect.net, true),
        ],
      },
      {
        title: 'نتیجه',
        rows: [amount('اثر ارزی خالص (با آثار غیرمستقیم)', schedule.netEffect, true)],
      },
    ],
  };
}

export const foreignExchangeTests = (schedule: ForeignExchangeSchedule): EconomicFigure[] => [
  {
    label: 'ارزش افزوده خالص ملی به ازای هر واحد ارز مصرف‌شده (به ارزش فعلی)',
    value: schedule.valueAddedPerForeignExchange,
    kind: 'factor',
  },
];

// ---------------------------------------------------------------------------------------------
// Tables whose columns are not the periods

/** A kind of the statement tables, a factor with three decimals, or a small ratio. */
export type MatrixKind = RowKind | 'factor' | 'significant';

export interface MatrixCell {
  value: string | null;
  kind: MatrixKind;
}

export interface MatrixRow {
  label: string;
  strong?: boolean;
  /** One cell per column of `head`. */
  cells: MatrixCell[];
}

/** A table with its own columns: a line per row, a measure or a case per column. */
export interface MatrixTable {
  id: string;
  title: string;
  /** Heading of the first column, which names the rows. */
  corner: string;
  head: string[];
  sections: { title?: string; rows: MatrixRow[] }[];
}

/** The number a cell of a matrix shows, as a canonical decimal string; null without a value. */
export function matrixNumber(cell: MatrixCell, unit: ReportingUnit): string | null {
  if (cell.value === null) return null;
  if (cell.kind === 'factor') return roundDecimal(cell.value, 3);
  if (cell.kind === 'significant') return roundSignificant(cell.value);
  return cellNumber(cell.value, cell.kind, unit);
}

const UNIT_DIGITS: Record<ReportingUnit, number> = {
  '1': 0,
  '1000': 3,
  '1000000': 6,
  '1000000000': 9,
};

const SKILLS = [
  ['unskilled', 'نیروی ساده'],
  ['skilled', 'نیروی ماهر'],
  ['total', 'جمع'],
] as const;

/**
 * The employment effect in the reference year: the project itself, the projects around it and
 * their sum, one column each. `amounts` is the display unit of the amounts (e.g. «میلیون IRR»):
 * the jobs per unit of investment are given per that unit, so that the ratio can be read.
 */
export function employmentTable(
  schedule: EmploymentSchedule,
  unit: ReportingUnit,
  amounts: string,
): MatrixTable {
  const lines: EmploymentLine[] = [
    schedule.direct,
    schedule.inputSupplying,
    schedule.outputUsing,
    schedule.indirect,
    schedule.total,
  ];
  const row = (
    label: string,
    kind: MatrixKind,
    pick: (line: EmploymentLine) => string | null,
    strong = false,
  ): MatrixRow => ({
    label,
    ...(strong ? { strong } : {}),
    cells: lines.map((line) => ({ value: pick(line), kind })),
  });
  const perUnit = (value: string | null) =>
    value === null ? null : shiftDecimal(value, UNIT_DIGITS[unit]);
  return {
    id: 'employment',
    title: 'اثر اشتغال در سال مرجع',
    corner: 'شرح',
    head: [
      'خود طرح (مستقیم)',
      'تأمین‌کنندگان نهاده',
      'مصرف‌کنندگان ستانده',
      'جمع غیرمستقیم',
      'جمع کل',
    ],
    sections: [
      {
        title: 'تعداد شاغلان (نفر)',
        rows: SKILLS.map(([skill, label]) =>
          row(label, 'quantity', (line) => line.jobs[skill], skill === 'total'),
        ),
      },
      {
        title: 'سرمایه‌گذاری و دستمزد سال مرجع',
        rows: [
          row('سرمایه‌گذاری', 'amount', (line) => line.investment, true),
          ...SKILLS.map(([skill, label]) =>
            row(`دستمزد: ${label}`, 'amount', (line) => line.wages[skill], skill === 'total'),
          ),
        ],
      },
      {
        title: `تعداد شغل به ازای هر ${amounts} سرمایه‌گذاری`,
        rows: SKILLS.map(([skill, label]) =>
          row(label, 'significant', (line) => perUnit(line.jobsPerInvestment[skill])),
        ),
      },
      {
        title: 'سرمایه‌گذاری به ازای هر شغل',
        rows: SKILLS.map(([skill, label]) =>
          row(label, 'amount', (line) => line.investmentPerJob[skill]),
        ),
      },
      {
        title: 'نسبت سرمایه‌گذاری به دستمزد سال مرجع',
        rows: SKILLS.map(([skill, label]) =>
          row(label, 'ratio', (line) => line.investmentToWages[skill]),
        ),
      },
    ],
  };
}

const isZero = (value: string) => /^-?0*\.?0*$/.test(value);

/** The cost-benefit schedule line by line, at present value in the numeraire. */
export function costBenefitTable(schedule: CostBenefitSchedule): MatrixTable {
  const { inflows, outflows } = schedule;
  const row = (label: string, line: CostBenefitLine, strong = false): MatrixRow => ({
    label,
    ...(strong ? { strong } : {}),
    cells: [
      { value: line.financialValue, kind: 'amount' },
      { value: line.adjustmentFactor, kind: 'factor' },
      { value: line.adjustedMarketValue, kind: 'amount' },
      { value: line.foreignCurrencyExposure, kind: 'percent' },
      { value: line.foreignExchangeAdjustment, kind: 'amount' },
      { value: line.economicValue, kind: 'amount' },
    ],
  });
  return {
    id: 'cost-benefit',
    title: 'تحلیل هزینه-فایده به قیمت‌های اقتصادی (ارزش فعلی)',
    corner: 'شرح',
    head: [
      'ارزش مالی',
      'ضریب تعدیل',
      'ارزش بازار تعدیل‌شده',
      'سهم ارزی (درصد)',
      'تعدیل ارزی',
      'ارزش اقتصادی',
    ],
    sections: [
      {
        title: 'ورودی‌ها',
        rows: [
          row('درآمد فروش', inflows.salesRevenue),
          row('سود سپرده کوتاه‌مدت', inflows.depositInterest),
          row('سایر درآمدها (فروش دارایی)', inflows.otherIncome),
          row('برداشت تسهیلات خارجی واردشده در تحلیل', inflows.foreignLoans),
          row('ارزش باقی‌مانده', inflows.residualValue),
          row('جمع ورودی‌ها', inflows.total, true),
        ],
      },
      {
        title: 'خروجی‌ها',
        rows: [
          row('سرمایه‌گذاری ثابت', outflows.fixedInvestment),
          row('هزینه‌های قبل از بهره‌برداری', outflows.preProduction),
          row('افزایش سرمایه در گردش خالص', outflows.workingCapitalIncrease),
          // Of an existing enterprise only.
          ...(isZero(outflows.startingBalance.financialValue) &&
          isZero(outflows.startingBalance.economicValue)
            ? []
            : [row('مانده آغازین شرکت موجود', outflows.startingBalance)]),
          row('هزینه‌های عملیاتی', outflows.operatingCosts),
          row('اجاره و لیزینگ', outflows.leasingCosts),
          row('هزینه‌های بازاریابی', outflows.marketingCosts),
          row('خدمت تسهیلات خارجی واردشده در تحلیل', outflows.foreignDebtService),
          row('مالیات بر درآمد', outflows.incomeTax),
          row('جمع خروجی‌ها', outflows.total, true),
        ],
      },
      { title: 'نتیجه', rows: [row('جریان خالص', schedule.netFlow, true)] },
    ],
  };
}

export const COST_BENEFIT_LEVELS = ['financial', 'adjusted', 'economic', 'withIndirect'] as const;
export type CostBenefitLevelKey = (typeof COST_BENEFIT_LEVELS)[number];

export const COST_BENEFIT_LEVEL_LABELS_FA: Record<CostBenefitLevelKey, string> = {
  financial: 'ارزش مالی',
  adjusted: 'ارزش بازار تعدیل‌شده',
  economic: 'ارزش اقتصادی (با تعدیل ارزی)',
  withIndirect: 'ارزش اقتصادی با آثار غیرمستقیم',
};

/** The net flow of the total capital per period at the four levels of valuation. */
export function costBenefitLevelsTable(schedule: CostBenefitSchedule): StatementTable {
  const rows: StatementSection['rows'] = COST_BENEFIT_LEVELS.map((key) => ({
    label: COST_BENEFIT_LEVEL_LABELS_FA[key],
    values: schedule.levels[key].net,
    kind: 'amount',
    ...(key === 'withIndirect' ? { strong: true } : {}),
  }));
  return {
    id: 'cost-benefit-levels',
    title: 'جریان خالص کل سرمایه در چهار سطح ارزش‌گذاری',
    salvageColumn: schedule.salvageColumn,
    sections: [{ rows }],
  };
}

export interface CostBenefitIndicators {
  key: CostBenefitLevelKey;
  title: string;
  npv: string;
  irr: string | undefined;
  /** What an existing enterprise brings in, charged before the first period; absent without one. */
  startingBalance: string | undefined;
  warnings: Warning[];
}

/** NPV and IRR of every level; the last one is the economic NPV and IRR of the project. */
export const costBenefitIndicators = (schedule: CostBenefitSchedule): CostBenefitIndicators[] =>
  COST_BENEFIT_LEVELS.map((key) => {
    const level: CostBenefitLevel = schedule.levels[key];
    return {
      key,
      title: COST_BENEFIT_LEVEL_LABELS_FA[key],
      npv: level.npv,
      irr: level.irr,
      startingBalance:
        level.startingBalance === undefined || isZero(level.startingBalance)
          ? undefined
          : level.startingBalance,
      warnings: level.warnings,
    };
  });

/** The indirect effects of the cost-benefit analysis at their economic value. */
export const costBenefitIndirect = (schedule: CostBenefitSchedule): EconomicFigure[] => [
  { label: 'منافع و آثار مثبت غیرمستقیم', value: schedule.indirect.benefits, kind: 'amount' },
  { label: 'هزینه‌ها و آثار منفی غیرمستقیم', value: schedule.indirect.costs, kind: 'amount' },
  { label: 'خالص آثار غیرمستقیم', value: schedule.indirect.net, kind: 'amount' },
];

// ---------------------------------------------------------------------------------------------
// Warnings

export const ECONOMIC_SCHEDULES = ['valueAdded', 'foreignExchange', 'employment'] as const;
export type EconomicScheduleKey = (typeof ECONOMIC_SCHEDULES)[number];

/** The economic schedule a warning of a run is about; null for every other warning. */
export function economicScheduleOfWarning(warning: Warning): EconomicScheduleKey | null {
  const family = warning.code.split('.')[0];
  return (ECONOMIC_SCHEDULES as readonly (string | undefined)[]).includes(family)
    ? (family as EconomicScheduleKey)
    : null;
}
