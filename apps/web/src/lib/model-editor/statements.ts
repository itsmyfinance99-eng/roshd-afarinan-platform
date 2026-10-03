import type { ProjectModel } from '@roshd/financial-engine';
import { EQUITY_CLASS_LABELS_FA, type ReportingUnit } from '@roshd/validation';
import type { Column, Frame } from './frame';
import { formatDecimalFa, fractionToPercent, roundDecimal, shiftDecimal } from './numbers';
import type { Basis } from './warnings';

/**
 * The schedules of a stored calculation run as tables (ST-34.08): rows with Persian labels in
 * COMFAR's order (manual X.C.5–7; comfar-model-spec §5), one value per project period. The values
 * are the engine's own decimal strings; only their display is rounded.
 */

export type RowKind = 'amount' | 'percent' | 'ratio';

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
}

type Statements = ProjectModel['statements'];
type Line = readonly [label: string, values: (string | null)[], strong?: boolean];

const amounts = (lines: Line[]): StatementRow[] =>
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

export function cashFlowTable(statements: Statements): StatementTable {
  const c = statements.cashFlow;
  return {
    id: 'cash-flow',
    title: 'جریان نقد برای برنامه‌ریزی مالی',
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
  const classes = Object.entries(EQUITY_CLASS_LABELS_FA).flatMap(([key, label]): Line[] => {
    const values = (liabilities.equity as Record<string, string[] | undefined>)[key];
    return values === undefined ? [] : [[`آورده: ${label}`, values]];
  });
  return {
    id: 'balance',
    title: 'ترازنامه پیش‌بینی‌شده',
    sections: [
      {
        title: 'دارایی‌ها',
        rows: amounts([
          ['مازاد نقد', assets.cashSurplus],
          ['موجودی مواد', assets.materials],
          ['کالای در جریان ساخت', assets.workInProgress],
          ['کالای ساخته‌شده', assets.finishedProducts],
          ['حساب‌های دریافتنی', assets.receivables],
          ['وجه نقد در گردش', assets.cashInHand],
          ['سپرده کوتاه‌مدت', assets.shortTermDeposits],
          ['جمع دارایی‌های جاری', assets.currentAssets, true],
          ['سرمایه‌گذاری ثابت (ارزش دفتری)', assets.fixedInvestment],
          ['هزینه‌های قبل از بهره‌برداری', assets.preProduction],
          ['سود و کارمزد دوره ساخت', assets.preProductionInterest],
          ['معافیت‌های استهلاک (کسر می‌شود)', assets.depreciationAllowances],
          ['جمع دارایی‌های ثابت', assets.fixedAssets, true],
          ['زیان انباشته', assets.accumulatedLosses],
          ['زیان تسعیر ارز', assets.exchangeLosses],
          ['جمع دارایی‌ها', assets.total, true],
        ]),
      },
      {
        title: 'بدهی‌ها و حقوق صاحبان سهام',
        rows: amounts([
          ['حساب‌های پرداختنی', liabilities.accountsPayable],
          ['اضافه‌برداشت خودکار', liabilities.automaticOverdraft],
          ['جمع بدهی‌های جاری', liabilities.currentLiabilities, true],
          ['بدهی بلندمدت', liabilities.longTermDebt],
          ...classes,
          ['آورده خودکار (پوشش کسری دوره ساخت)', liabilities.automaticEquity],
          ['جمع آورده', liabilities.totalEquity, true],
          ['سود انباشته', liabilities.reserves],
          ['سود تسعیر ارز', liabilities.exchangeGains],
          ['جمع بدهی‌ها و حقوق صاحبان سهام', liabilities.total, true],
        ]),
      },
      {
        // Not a part of the totals above: equity plus retained profit, less exchange losses.
        title: 'ارزش ویژه',
        rows: amounts([['ارزش ویژه (آورده و سود انباشته)', netWorth, true]]),
      },
    ],
  };
}

export const DISCOUNTED_TITLES_FA: Record<Basis, string> = {
  totalCapital: 'جریان نقدی تنزیل‌شده کل سرمایه',
  equity: 'جریان نقدی تنزیل‌شده آورده',
};

export function discountedCashFlowTable(statements: Statements, basis: Basis): StatementTable {
  const flow = statements[basis];
  // Inflows and outflows are per period; the residual value returns in the last column — the
  // year after production, or the last period itself.
  const last = flow.net.length - 1;
  const perPeriod = (values: string[]) => flow.net.map((_, j) => values[j] ?? null);
  return {
    id: `discounted-${basis}`,
    title: DISCOUNTED_TITLES_FA[basis],
    salvageColumn: flow.salvageColumn,
    sections: [
      {
        rows: amounts([
          ['ورودی نقد', perPeriod(flow.inflow)],
          ['خروجی نقد', perPeriod(flow.outflow)],
          [
            'ارزش باقی‌مانده (دارایی‌ها و سرمایه در گردش)',
            flow.net.map((_, j) => (j === last ? flow.residualValue : null)),
          ],
          ['جریان نقد خالص', flow.net, true],
          ['جریان نقد خالص تجمعی', flow.cumulative],
          ['ارزش فعلی جریان نقد خالص', flow.presentValue],
          ['ارزش فعلی تجمعی', flow.cumulativePresentValue, true],
        ]),
      },
    ],
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
        values: points.map((_, j) => debtService?.periods[j]?.cashAvailable ?? null),
        kind: 'amount',
      },
      {
        label: 'خدمت بدهی (اصل، سود و کارمزد)',
        values: points.map((_, j) => debtService?.periods[j]?.debtService ?? null),
        kind: 'amount',
      },
      ratio(
        'نسبت پوشش خدمت بدهی',
        points.map((_, j) => debtService?.periods[j]?.ratio ?? null),
      ),
    ],
  };
}

/** The columns of a table: the periods, and the year after production when values return there. */
export function tableColumns(frame: Frame, salvageColumn = false): Column[] {
  return salvageColumn
    ? [...frame.periods, { label: 'پس از تولید', group: 'ارزش باقی‌مانده' }]
    : frame.periods;
}

const UNIT_DIGITS: Record<ReportingUnit, number> = {
  '1': 0,
  '1000': 3,
  '1000000': 6,
  '1000000000': 9,
};

/** An amount in the display unit: whole numbers in single units, one decimal otherwise. */
export function formatAmount(value: string, unit: ReportingUnit): string {
  const digits = UNIT_DIGITS[unit];
  return formatDecimalFa(roundDecimal(shiftDecimal(value, -digits), digits === 0 ? 0 : 1));
}

export const formatPercent = (value: string): string =>
  formatDecimalFa(roundDecimal(fractionToPercent(value), 2));

export const formatRatio = (value: string): string => formatDecimalFa(roundDecimal(value, 2));

/** The text of a cell; «—» where the line has no value in that period. */
export function formatCell(value: string | null | undefined, kind: RowKind, unit: ReportingUnit) {
  if (value === null || value === undefined) return '—';
  if (kind === 'amount') return formatAmount(value, unit);
  return kind === 'percent' ? formatPercent(value) : formatRatio(value);
}
