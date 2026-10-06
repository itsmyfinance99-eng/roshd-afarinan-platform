import type { IncrementalAnalysis, ProjectModel } from '@roshd/financial-engine';
import { EQUITY_CLASS_LABELS_FA, type ReportingUnit } from '@roshd/validation';
import type { Column, Frame } from './frame';
import { formatDecimalFa, fractionToPercent, roundDecimal, shiftDecimal } from './numbers';
import type { Basis } from './warnings';

/**
 * The schedules of a stored calculation run as tables (ST-34.08): rows with Persian labels in
 * COMFAR's order (manual X.C.5–7; comfar-model-spec §5), one value per project period. The values
 * are the engine's own decimal strings; only their display is rounded.
 */

/**
 * How a value is shown: an amount in the display unit, a fraction as a percentage, a ratio, a
 * physical quantity, or an input exactly as it was entered (`entered`; `enteredPercent` for a rate
 * or share, which is stored as a fraction).
 */
export type RowKind = 'amount' | 'percent' | 'ratio' | 'quantity' | 'entered' | 'enteredPercent';

export interface StatementRow {
  label: string;
  /** One value per column; null where the line has no value (a ratio that cannot be computed). */
  values: (string | null)[];
  kind: RowKind;
  /** A total or a result line. */
  strong?: boolean;
}

export interface StatementSection {
  /** Heading of a group of rows, e.g. «ورودی‌های نقد». */
  title?: string;
  rows: StatementRow[];
}

export interface StatementTable {
  id: string;
  title: string;
  sections: StatementSection[];
  /** The table has one more column than the horizon: the year in which residual values return. */
  salvageColumn?: boolean;
  /**
   * The table starts with one more column: the day before the first period, with the starting
   * balances of an existing enterprise (expansion and rehabilitation projects).
   */
  openingColumn?: boolean;
  /**
   * The table ends with two more columns: the sum of the periods and their present value (the
   * schedules of the economic analysis).
   */
  totalColumns?: boolean;
}

type Statements = ProjectModel['statements'];
export type Line = readonly [label: string, values: (string | null)[], strong?: boolean];

/** Rows of amounts in local currency. */
export const amounts = (lines: Line[]): StatementRow[] =>
  lines.map(([label, values, strong]) => ({
    label,
    values,
    kind: 'amount',
    ...(strong ? { strong } : {}),
  }));

export function incomeStatementTable(statements: Statements): StatementTable {
  const s = statements.incomeStatement;
  return {
    id: 'income',
    title: 'صورت سود و زیان',
    sections: [
      {
        rows: amounts([
          ['درآمد فروش', s.salesRevenue],
          ['هزینه‌های متغیر', s.variableCosts],
          ['حاشیه فروش متغیر', s.variableMargin, true],
          ['هزینه‌های ثابت (بدون استهلاک)', s.fixedCosts],
          ['استهلاک', s.depreciation],
          ['حاشیه عملیاتی', s.operationalMargin, true],
          ['سود سپرده کوتاه‌مدت', s.depositInterest],
          ['هزینه‌های مالی', s.financialCosts],
          ['سود عملیات پس از هزینه‌های مالی', s.grossProfitFromOperations, true],
          ['درآمد غیرعملیاتی (فروش دارایی)', s.extraordinaryIncome],
          ['زیان غیرعملیاتی (فروش دارایی)', s.extraordinaryLoss],
          ['معافیت استهلاک', s.depreciationAllowance],
          ['سود پیش از مالیات', s.grossProfit, true],
          ['معافیت سرمایه‌گذاری', s.investmentAllowance],
          ['زیان سال‌های قبل (کسرشده)', s.deductibleLoss],
          ['سود مشمول مالیات', s.taxableProfit],
          ['مالیات بر درآمد', s.incomeTax],
          ['سود خالص', s.netProfit, true],
          ['سود سهام', s.dividends],
          ['سود تقسیم‌نشده دوره', s.retainedProfit, true],
        ]),
      },
    ],
  };
}

export function cashFlowTable(
  statements: Pick<Statements, 'cashFlow'> & Partial<Pick<Statements, 'startingBalance'>>,
): StatementTable {
  const flow = statements.cashFlow;
  // An existing enterprise starts with its cash surplus: the first column, the day before the
  // project, holds it, so that the cumulative lines can be followed.
  const start = statements.startingBalance?.assets.cashSurplus;
  const lead = <T>(values: T[], first: string | null = null): (T | string | null)[] =>
    start === undefined ? values : [first, ...values];
  const rows = (group: Record<string, string[]>) =>
    Object.fromEntries(Object.entries(group).map(([key, values]) => [key, lead(values)]));
  const c = {
    inflows: rows(flow.inflows) as Record<keyof typeof flow.inflows, (string | null)[]>,
    outflows: rows(flow.outflows) as Record<
      Exclude<keyof typeof flow.outflows, 'equityRefunds'>,
      (string | null)[]
    > & { equityRefunds?: (string | null)[] },
    surplus: lead(flow.surplus),
    cumulativeSurplus: lead(flow.cumulativeSurplus, start),
    automaticEquity: lead(flow.automaticEquity),
    automaticOverdraft: lead(flow.automaticOverdraft),
    automaticOverdraftBalance: lead(flow.automaticOverdraftBalance),
    cashBalance: lead(flow.cashBalance, start),
  };
  return {
    id: 'cash-flow',
    title: 'جریان نقد برای برنامه‌ریزی مالی',
    ...(start === undefined ? {} : { openingColumn: true }),
    sections: [
      {
        title: 'ورودی‌های نقد',
        rows: amounts([
          ['آورده و کمک‌ها', c.inflows.equity],
          ['تسهیلات بلندمدت', c.inflows.longTermLoans],
          ['افزایش حساب‌های پرداختنی', c.inflows.payablesIncrease],
          ['درآمد فروش', c.inflows.salesRevenue],
          ['سود سپرده کوتاه‌مدت', c.inflows.depositInterest],
          ['سایر درآمدها (فروش دارایی)', c.inflows.otherIncome],
          ['جمع ورودی‌ها', c.inflows.total, true],
        ]),
      },
      {
        title: 'خروجی‌های نقد',
        rows: amounts([
          ['سرمایه‌گذاری ثابت', c.outflows.fixedInvestment],
          ['هزینه‌های قبل از بهره‌برداری (بدون سود تسهیلات)', c.outflows.preProduction],
          ['افزایش دارایی‌های جاری', c.outflows.currentAssetsIncrease],
          ['هزینه‌های عملیاتی', c.outflows.operatingCosts],
          ['اجاره و لیزینگ', c.outflows.leasingCosts],
          ['هزینه‌های بازاریابی', c.outflows.marketingCosts],
          ['مالیات بر درآمد', c.outflows.incomeTax],
          ['هزینه‌های مالی', c.outflows.financialCosts],
          ['بازپرداخت تسهیلات', c.outflows.loanRepayments],
          ['سود سهام', c.outflows.dividends],
          // A run stored before refunds of equity existed has no such line.
          ...(c.outflows.equityRefunds === undefined
            ? []
            : [['بازپرداخت آورده', c.outflows.equityRefunds] satisfies Line]),
          ['جمع خروجی‌ها', c.outflows.total, true],
        ]),
      },
      {
        title: 'مازاد و پوشش کسری',
        rows: amounts([
          ['مازاد (کسری) دوره', c.surplus, true],
          ['مازاد (کسری) تجمعی', c.cumulativeSurplus],
          ['پوشش خودکار: آورده دوره ساخت', c.automaticEquity],
          ['پوشش خودکار: اضافه‌برداشت بدون بهره', c.automaticOverdraft],
          ['مانده اضافه‌برداشت خودکار', c.automaticOverdraftBalance],
          ['مانده نقد پایان دوره', c.cashBalance, true],
        ]),
      },
    ],
  };
}

export function balanceSheetTable(statements: Statements): StatementTable {
  const { assets, liabilities, netWorth } = statements.balanceSheet;
  // An existing enterprise: its balance sheet on the day before the project is the first column.
  // A run stored before starting balances existed has none.
  const start = statements.startingBalance;
  const opening = (values: string[], value: string | undefined): string[] =>
    start === undefined ? values : [value ?? '0', ...values];
  const classes = Object.entries(EQUITY_CLASS_LABELS_FA).flatMap(([key, label]): Line[] => {
    const values = (liabilities.equity as Record<string, string[] | undefined>)[key];
    const first = (start?.liabilities.equity as Record<string, string | undefined> | undefined)?.[
      key
    ];
    return values === undefined ? [] : [[`آورده: ${label}`, opening(values, first)]];
  });
  return {
    id: 'balance',
    title: 'ترازنامه پیش‌بینی‌شده',
    ...(start === undefined ? {} : { openingColumn: true }),
    sections: [
      {
        title: 'دارایی‌ها',
        rows: amounts([
          ['مازاد نقد', opening(assets.cashSurplus, start?.assets.cashSurplus)],
          ['موجودی مواد', opening(assets.materials, start?.assets.materials)],
          ['کالای در جریان ساخت', opening(assets.workInProgress, start?.assets.workInProgress)],
          ['کالای ساخته‌شده', opening(assets.finishedProducts, start?.assets.finishedProducts)],
          ['حساب‌های دریافتنی', opening(assets.receivables, start?.assets.receivables)],
          ['وجه نقد در گردش', opening(assets.cashInHand, start?.assets.cashInHand)],
          ['سپرده کوتاه‌مدت', opening(assets.shortTermDeposits, start?.assets.shortTermDeposits)],
          ['جمع دارایی‌های جاری', opening(assets.currentAssets, start?.assets.currentAssets), true],
          [
            'سرمایه‌گذاری ثابت (ارزش دفتری)',
            opening(assets.fixedInvestment, start?.assets.fixedInvestment),
          ],
          [
            'هزینه‌های قبل از بهره‌برداری',
            opening(assets.preProduction, start?.assets.preProduction),
          ],
          ['سود و کارمزد دوره ساخت', opening(assets.preProductionInterest, undefined)],
          ['معافیت‌های استهلاک (کسر می‌شود)', opening(assets.depreciationAllowances, undefined)],
          ['جمع دارایی‌های ثابت', opening(assets.fixedAssets, start?.assets.fixedAssets), true],
          ['زیان انباشته', opening(assets.accumulatedLosses, start?.assets.accumulatedLosses)],
          ['زیان تسعیر ارز', opening(assets.exchangeLosses, undefined)],
          ['جمع دارایی‌ها', opening(assets.total, start?.assets.total), true],
        ]),
      },
      {
        title: 'بدهی‌ها و حقوق صاحبان سهام',
        rows: amounts([
          [
            'حساب‌های پرداختنی',
            opening(liabilities.accountsPayable, start?.liabilities.accountsPayable),
          ],
          ['اضافه‌برداشت خودکار', opening(liabilities.automaticOverdraft, undefined)],
          [
            'جمع بدهی‌های جاری',
            opening(liabilities.currentLiabilities, start?.liabilities.currentLiabilities),
            true,
          ],
          ['بدهی بلندمدت', opening(liabilities.longTermDebt, start?.liabilities.longTermDebt)],
          ...classes,
          ['آورده خودکار (پوشش کسری دوره ساخت)', opening(liabilities.automaticEquity, undefined)],
          ['جمع آورده', opening(liabilities.totalEquity, start?.liabilities.totalEquity), true],
          ['سود انباشته', opening(liabilities.reserves, start?.liabilities.reserves)],
          ['سود تسعیر ارز', opening(liabilities.exchangeGains, undefined)],
          [
            'جمع بدهی‌ها و حقوق صاحبان سهام',
            opening(liabilities.total, start?.liabilities.total),
            true,
          ],
        ]),
      },
      {
        // Not a part of the totals above: equity plus retained profit, less exchange losses.
        title: 'ارزش ویژه',
        rows: amounts([['ارزش ویژه', opening(netWorth, start?.netWorth), true]]),
      },
    ],
  };
}

export const DISCOUNTED_TITLES_FA: Record<Basis, string> = {
  totalCapital: 'جریان نقدی تنزیل‌شده کل سرمایه',
  equity: 'جریان نقدی تنزیل‌شده آورده',
};

type Flow = Statements[Basis];

const isZero = (value: string) => /^-?0*\.?0*$/.test(value);
const negated = (value: string) =>
  isZero(value) ? '0' : value.startsWith('-') ? value.slice(1) : `-${value}`;

/** What a starting balance charges a discounted cash flow with; null when there is none. */
function startingCharge(
  flow: Pick<Flow, 'startingBalance' | 'startingBalancePresentValue'>,
): { amount: string; present: string } | null {
  const amount = flow.startingBalance;
  // A balance of zero charges nothing, and a run stored before starting balances has none.
  if (amount === undefined || isZero(amount)) return null;
  return { amount, present: flow.startingBalancePresentValue ?? amount };
}

export const STARTING_BALANCE_LABELS_FA: Record<Basis, string> = {
  totalCapital: 'مانده آغازین (دارایی‌های ثابت و جاری منهای بدهی‌های جاری)',
  equity: 'مانده آغازین (آورده موجود)',
};

export function discountedCashFlowTable(
  statements: Pick<Statements, Basis>,
  basis: Basis,
  title = DISCOUNTED_TITLES_FA[basis],
): StatementTable {
  const flow = statements[basis];
  // Inflows and outflows are per period; the residual value returns in the last column — the
  // year after production, or the last period itself. The starting balance of an existing
  // enterprise is charged in a first column of its own, the day before the project.
  const last = flow.net.length - 1;
  const charge = startingCharge(flow);
  const column = (first: string | null, values: (string | null)[]) =>
    charge === null ? values : [first, ...values];
  const perPeriod = (values: string[]) => flow.net.map((_, j) => values[j] ?? null);
  return {
    id: `discounted-${basis}`,
    title,
    salvageColumn: flow.salvageColumn,
    ...(charge === null ? {} : { openingColumn: true }),
    sections: [
      {
        rows: amounts([
          ...(charge === null
            ? []
            : [
                [
                  STARTING_BALANCE_LABELS_FA[basis],
                  column(
                    charge.amount,
                    flow.net.map(() => null),
                  ),
                ] satisfies Line,
              ]),
          ['ورودی نقد', column(null, perPeriod(flow.inflow))],
          ['خروجی نقد', column(null, perPeriod(flow.outflow))],
          [
            'ارزش باقی‌مانده (دارایی‌ها و سرمایه در گردش)',
            column(
              null,
              flow.net.map((_, j) => (j === last ? flow.residualValue : null)),
            ),
          ],
          ['جریان نقد خالص', column(charge && negated(charge.amount), flow.net), true],
          ['جریان نقد خالص تجمعی', column(charge && negated(charge.amount), flow.cumulative)],
          [
            'ارزش فعلی جریان نقد خالص',
            column(charge && negated(charge.present), flow.presentValue),
          ],
          [
            'ارزش فعلی تجمعی',
            column(charge && negated(charge.present), flow.cumulativePresentValue),
            true,
          ],
        ]),
      },
    ],
  };
}

type ShareholderFlow = NonNullable<Statements['shareholders']>[number];

/**
 * The cash flow of one shareholder (ST-34.12; manual XI.F, X.C.6 «partner capital invested»):
 * dividends and refunds of equity against the equity paid in, the starting equity on the day
 * before the project and the shareholder's part of the net worth at the end.
 */
export function shareholderFlowTable(flow: ShareholderFlow, index: number): StatementTable {
  const last = flow.net.length - 1;
  const charge = startingCharge(flow);
  const column = (first: string | null, values: (string | null)[]) =>
    charge === null ? values : [first, ...values];
  const perPeriod = (values: string[]) => flow.net.map((_, j) => values[j] ?? null);
  return {
    id: `shareholder-${index + 1}`,
    title: `جریان نقدی تنزیل‌شده سهامدار «\u2068${flow.equity}\u2069»`,
    salvageColumn: flow.salvageColumn,
    ...(charge === null ? {} : { openingColumn: true }),
    sections: [
      {
        rows: amounts([
          ...(charge === null
            ? []
            : [
                [
                  STARTING_BALANCE_LABELS_FA.equity,
                  column(
                    charge.amount,
                    flow.net.map(() => null),
                  ),
                ] satisfies Line,
              ]),
          ['سود سهام دریافتی', column(null, perPeriod(flow.dividends))],
          ['بازپرداخت آورده', column(null, perPeriod(flow.refunds))],
          ['جمع دریافتی‌ها', column(null, perPeriod(flow.inflow)), true],
          ['آورده پرداختی', column(null, perPeriod(flow.outflow))],
          [
            'سهم از ارزش ویژه پایان طرح',
            column(
              null,
              flow.net.map((_, j) => (j === last ? flow.residualValue : null)),
            ),
          ],
          ['جریان نقد خالص', column(charge && negated(charge.amount), flow.net), true],
          ['جریان نقد خالص تجمعی', column(charge && negated(charge.amount), flow.cumulative)],
          [
            'ارزش فعلی جریان نقد خالص',
            column(charge && negated(charge.present), flow.presentValue),
          ],
          [
            'ارزش فعلی تجمعی',
            column(charge && negated(charge.present), flow.cumulativePresentValue),
            true,
          ],
        ]),
      },
    ],
  };
}

/** The tables of every shareholder; none when the run has no shareholder flows. */
export const shareholderFlowTables = (statements: Pick<Statements, 'shareholders'>) =>
  (statements.shareholders ?? []).map(shareholderFlowTable);

/**
 * Incremental analysis (ST-34.11; manual XIV): for the cash flow of the total capital or of the
 * equity, the net flow with the project, without it, and their difference with its cumulative and
 * present values. The indicators of the difference are shown beside the table by the page.
 */
export function incrementalFlowTable(
  analysis: IncrementalAnalysis,
  withProject: Pick<Statements, Basis>,
  withoutProject: Pick<Statements, Basis>,
  basis: Basis,
): StatementTable {
  const flow = analysis[basis];
  const charge = startingCharge(flow);
  const column = (first: string | null, values: (string | null)[]) =>
    charge === null ? values : [first, ...values];
  // The cases are shown without their own starting balances; the difference carries what is left.
  const perPeriod = (values: string[]) => flow.net.map((_, j) => values[j] ?? null);
  return {
    id: `incremental-${basis}`,
    title: `تحلیل افزایشی: ${DISCOUNTED_TITLES_FA[basis]}`,
    salvageColumn: flow.salvageColumn,
    ...(charge === null ? {} : { openingColumn: true }),
    sections: [
      {
        title: 'جریان نقد خالص دو حالت',
        rows: amounts([
          ['با طرح', column(null, perPeriod(withProject[basis].net))],
          ['بدون طرح', column(null, perPeriod(withoutProject[basis].net))],
        ]),
      },
      {
        title: 'اثر طرح (با طرح منهای بدون طرح)',
        rows: amounts([
          ['جریان نقد خالص افزایشی', column(charge && negated(charge.amount), flow.net), true],
          [
            'جریان نقد خالص افزایشی تجمعی',
            column(charge && negated(charge.amount), flow.cumulative),
          ],
          [
            'ارزش فعلی جریان نقد افزایشی',
            column(charge && negated(charge.present), flow.presentValue),
          ],
          [
            'ارزش فعلی تجمعی',
            column(charge && negated(charge.present), flow.cumulativePresentValue),
            true,
          ],
        ]),
      },
    ],
  };
}

/** The cash flow for financial planning of the difference, line by line. */
export function incrementalCashFlowTable(analysis: IncrementalAnalysis): StatementTable {
  return {
    ...cashFlowTable(analysis),
    id: 'incremental-cash-flow',
    title: 'تحلیل افزایشی: جریان نقد برای برنامه‌ریزی مالی (با طرح منهای بدون طرح)',
  };
}

export function ratiosTable(statements: Statements): StatementTable {
  const { ratios, breakEven, debtService } = statements;
  const points = breakEven.periods;
  const percent = (label: string, values: (string | null)[]): StatementRow => ({
    label,
    values,
    kind: 'percent',
  });
  const ratio = (label: string, values: (string | null)[]): StatementRow => ({
    label,
    values,
    kind: 'ratio',
  });
  return {
    id: 'ratios',
    title: 'نسبت‌ها، نقطه سربه‌سر و پوشش بدهی',
    sections: [
      {
        title: 'نسبت‌های مالی',
        rows: [
          percent('سود خالص به فروش', ratios.netProfitToSales),
          percent('سود خالص به آورده', ratios.netProfitToEquity),
          percent('سود خالص به ارزش ویژه', ratios.netProfitToNetWorth),
          ratio('بدهی بلندمدت به ارزش ویژه', ratios.longTermDebtToNetWorth),
          ratio('نسبت جاری', ratios.currentRatio),
        ],
      },
      {
        title: 'نقطه سربه‌سر هر دوره تولید',
        rows: [
          percent(
            'فروش سربه‌سر به فروش برنامه (با هزینه مالی)',
            points.map((p) => p?.includingFinance.breakEvenRatio ?? null),
          ),
          percent(
            'فروش سربه‌سر به فروش برنامه (بدون هزینه مالی)',
            points.map((p) => p?.excludingFinance.breakEvenRatio ?? null),
          ),
          ratio(
            'پوشش هزینه ثابت (با هزینه مالی)',
            points.map((p) => p?.includingFinance.fixedCostCoverageRatio ?? null),
          ),
        ],
      },
      // A project without long-term loans has no debt service to cover.
      ...(debtService === null ? [] : [debtServiceSection(debtService, points.length)]),
    ],
  };
}

function debtServiceSection(
  debtService: NonNullable<Statements['debtService']>,
  periods: number,
): StatementSection {
  const points = Array.from({ length: periods });
  const ratio = (label: string, values: (string | null)[]): StatementRow => ({
    label,
    values,
    kind: 'ratio',
  });
  return {
    title: 'خدمت بدهی بلندمدت',
    rows: [
      {
        label: 'نقد در دسترس برای خدمت بدهی',
        values: points.map((_, j) => debtService.periods[j]?.cashAvailable ?? null),
        kind: 'amount',
      },
      {
        label: 'خدمت بدهی (اصل، سود و کارمزد)',
        values: points.map((_, j) => debtService.periods[j]?.debtService ?? null),
        kind: 'amount',
      },
      ratio(
        'نسبت پوشش خدمت بدهی',
        points.map((_, j) => debtService.periods[j]?.ratio ?? null),
      ),
    ],
  };
}

/**
 * The columns of a table: the periods, the year after production when values return there, the
 * day before the project when the table starts with the starting balances, and the total and the
 * present value of a line of the economic analysis.
 */
export function tableColumns(
  frame: Frame,
  salvageColumn = false,
  openingColumn = false,
  totalColumns = false,
): Column[] {
  return [
    ...(openingColumn ? [{ label: 'پیش از طرح', group: 'مانده آغازین' }] : []),
    ...frame.periods,
    ...(salvageColumn ? [{ label: 'پس از تولید', group: 'ارزش باقی‌مانده' }] : []),
    ...(totalColumns
      ? [
          { label: 'جمع', group: 'همه دوره‌ها' },
          { label: 'ارزش فعلی', group: 'با نرخ تنزیل اقتصادی' },
        ]
      : []),
  ];
}

/** The columns of a table of a run. */
export const columnsOf = (frame: Frame, table: StatementTable): Column[] =>
  tableColumns(frame, table.salvageColumn, table.openingColumn, table.totalColumns);

const UNIT_DIGITS: Record<ReportingUnit, number> = {
  '1': 0,
  '1000': 3,
  '1000000': 6,
  '1000000000': 9,
};

/** The number a cell shows, as a canonical decimal string; null where the line has no value. */
export function cellNumber(
  value: string | null | undefined,
  kind: RowKind,
  unit: ReportingUnit,
): string | null {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case 'amount': {
      // Whole numbers in single units, one decimal otherwise.
      const digits = UNIT_DIGITS[unit];
      return roundDecimal(shiftDecimal(value, -digits), digits === 0 ? 0 : 1);
    }
    case 'percent':
      return roundDecimal(fractionToPercent(value), 2);
    case 'ratio':
    case 'quantity':
      return roundDecimal(value, 2);
    case 'entered':
      return value;
    case 'enteredPercent':
      return fractionToPercent(value);
  }
}

/** An amount in the display unit: whole numbers in single units, one decimal otherwise. */
export const formatAmount = (value: string, unit: ReportingUnit): string =>
  formatDecimalFa(cellNumber(value, 'amount', unit) ?? value);

export const formatPercent = (value: string): string =>
  formatDecimalFa(cellNumber(value, 'percent', '1') ?? value);

export const formatRatio = (value: string): string =>
  formatDecimalFa(cellNumber(value, 'ratio', '1') ?? value);

/** The text of a cell; «—» where the line has no value in that period. */
export function formatCell(value: string | null | undefined, kind: RowKind, unit: ReportingUnit) {
  const number = cellNumber(value, kind, unit);
  return number === null ? '—' : formatDecimalFa(number);
}
