import { ZERO, toDecimal, toDecimalString, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import {
  breakEven,
  debtServiceCoverage,
  npvRatio,
  type BreakEvenValue,
  type DebtServiceCoverageValue,
  type NpvRatioValue,
} from '../indicators';
import type { DiscountReference } from '../time-value';
import type { CalculationResult, CalculationWarning, DefaultUsed } from '../types';
import { MODEL_VERSION } from '../version';
import { periodAmounts, withField } from './asset-depreciation';
import {
  discountedFlow,
  type DiscountedCashFlow,
  type DiscountedFlow,
  type IndicatorScope,
} from './discounted-flow';
import { distributeProfit, type DividendShareholder } from './dividends';
import { EQUITY_CLASSES, type EquityClass, type FinancingSchedule } from './financing';
import type { PlanningHorizon } from './horizon';
import { uniqueKeys, type InvestmentSchedule } from './investment';
import type { OperationsSchedule } from './operations';
import { startingAmount } from './starting-balances';
import { incomeTax, perYear, type PerYear, type TaxConditions, type TaxYear } from './tax';

export type { DiscountedCashFlow } from './discounted-flow';

/**
 * Projected financial statements and indicators (manual X.C.6–7, XI.F, XI.I, XI.N, XI.P–R;
 * comfar-model-spec §4.2, §4.9–4.11, §5): the net income statement, the cash flow for financial
 * planning with the automatic coverage of cash deficits, the projected balance sheet, the
 * discounted cash flows of the total capital and of the equity with their indicators, break-even
 * and debt-service coverage. Everything is built from the investment, financing and operations
 * schedules, per project period and in local currency.
 *
 * Tax and dividends are yearly: they are computed on the profit of each financial year of
 * production and booked in the period that contains its balance date, like depreciation.
 */

export type ResidualValueTiming = 'YEAR_AFTER_PRODUCTION' | 'END_OF_PRODUCTION';

export interface AssetSale {
  /** Key of the fixed-investment or pre-production item that is sold. */
  item: string;
  /** Production period ending on a balance date; the sale is booked on its last day. */
  period: number;
  /** Sales price in local currency. */
  proceeds: DecimalString;
}

export interface ShareholderDividends {
  /** Key of the equity contribution the dividends belong to (not a subsidy). */
  equity: string;
  /** Preferred dividend as a fraction of the accumulated paid-in equity, per production year. */
  preferredRate: PerYear;
  /** Preferred dividend as an amount in local currency, per production year. */
  preferredAmount: PerYear;
  /** Share of the profit remaining after preferred dividends, per production year. */
  ordinaryShare: PerYear;
  /** Share of the dividends that leaves the country. */
  repatriatedShare: DecimalString;
  /**
   * Share of the net worth this shareholder receives after the last production period (VII.R.4).
   * Entered for every shareholder or for none; with it the cash flow of each shareholder is
   * produced (XI.F).
   */
  netWorthShare?: DecimalString;
}

export interface StatementsInput {
  horizon: PlanningHorizon;
  investment: InvestmentSchedule;
  financing: FinancingSchedule;
  operations: OperationsSchedule;
  tax: TaxConditions;
  /** Allowances per project period in local currency (production periods only). */
  allowances?: { investment: DecimalString[]; depreciation: DecimalString[] };
  assetSales?: AssetSale[];
  profitDistribution: {
    /** Share of a positive net profit kept in the project, per production year. */
    retainedShare: PerYear;
    shareholders: ShareholderDividends[];
  };
  discounting: {
    /** Annual discount rate of the total capital: one rate or one per project period. */
    totalCapitalRate: DecimalString | DecimalString[];
    /** Annual discount rate of the equity: one rate or one per project period. */
    equityRate: DecimalString | DecimalString[];
    /** COMFAR's default (end of the first year) when absent; listed in `defaultsUsed`. */
    reference?: DiscountReference;
    /** MIRR rates; the IRR of the same basis when absent (COMFAR default). */
    reinvestmentRate?: DecimalString;
    borrowingRate?: DecimalString;
  };
  /** COMFAR's reference year: a financial year of production (from 0), used for break-even. */
  referenceYear: number;
  /** Year of the break-even analysis; the reference year when absent (COMFAR default). */
  breakEvenYear?: number;
  /** When residual values return; the year after production when absent (COMFAR default). */
  residualValueTiming?: ResidualValueTiming;
  /** Automatic coverage of cash deficits; on when absent (COMFAR default). */
  automaticCashCoverage?: boolean;
  /**
   * How much of the discounted cash flows to compute: everything (when absent), the NPV only, or
   * the NPV and IRR. Searches that run the model many times (goal seek) ask for what they need.
   */
  indicatorScope?: IndicatorScope;
  /**
   * Cash surplus of an existing enterprise on the day before the first period (expansion and
   * rehabilitation projects): the opening balance of the cash flow. The other starting balances
   * come with the investment, financing and operations schedules.
   */
  startingCash?: DecimalString;
}

export interface IncomeStatement {
  salesRevenue: DecimalString[];
  /** Variable costs of the products sold. */
  variableCosts: DecimalString[];
  variableMargin: DecimalString[];
  /** Fixed costs of the products sold, without depreciation. */
  fixedCosts: DecimalString[];
  depreciation: DecimalString[];
  operationalMargin: DecimalString[];
  depositInterest: DecimalString[];
  /** Interest and fees paid in production periods (capitalised interest excluded). */
  financialCosts: DecimalString[];
  grossProfitFromOperations: DecimalString[];
  /** Sale of assets above (income) or below (loss) book value. */
  extraordinaryIncome: DecimalString[];
  extraordinaryLoss: DecimalString[];
  depreciationAllowance: DecimalString[];
  grossProfit: DecimalString[];
  investmentAllowance: DecimalString[];
  /** Yearly lines, booked in the period of the balance date. */
  deductibleLoss: DecimalString[];
  taxableProfit: DecimalString[];
  incomeTax: DecimalString[];
  netProfit: DecimalString[];
  dividends: DecimalString[];
  retainedProfit: DecimalString[];
}

export interface CashFlowForPlanning {
  inflows: {
    /** Paid-in equity and subsidies, without the automatic equity. */
    equity: DecimalString[];
    /** Disbursements and capitalised interest of long-term loans. */
    longTermLoans: DecimalString[];
    /** Increase of accounts payable (short-term finance); a decrease is negative. */
    payablesIncrease: DecimalString[];
    salesRevenue: DecimalString[];
    depositInterest: DecimalString[];
    /** Proceeds of assets sold. */
    otherIncome: DecimalString[];
    total: DecimalString[];
  };
  outflows: {
    fixedInvestment: DecimalString[];
    /** Pre-production expenditures net of interest. */
    preProduction: DecimalString[];
    currentAssetsIncrease: DecimalString[];
    /** Operating, leasing and marketing costs of the products sold. */
    operatingCosts: DecimalString[];
    leasingCosts: DecimalString[];
    marketingCosts: DecimalString[];
    incomeTax: DecimalString[];
    /** Interest paid, capitalised interest and fees. */
    financialCosts: DecimalString[];
    loanRepayments: DecimalString[];
    dividends: DecimalString[];
    /** Equity paid out again (capital refund). */
    equityRefunds: DecimalString[];
    total: DecimalString[];
  };
  /** Inflows less outflows, before the automatic coverage (COMFAR's surplus/deficit line). */
  surplus: DecimalString[];
  cumulativeSurplus: DecimalString[];
  /** «پوشش خودکار»: equity generated to cover a deficit of a construction period. */
  automaticEquity: DecimalString[];
  /** «پوشش خودکار»: interest-free overdraft drawn (+) or repaid (−) in a production period. */
  automaticOverdraft: DecimalString[];
  automaticOverdraftBalance: DecimalString[];
  /** Cash at the end of each period after the automatic coverage (the balance sheet's cash). */
  cashBalance: DecimalString[];
}

export interface BalanceSheet {
  assets: {
    cashSurplus: DecimalString[];
    materials: DecimalString[];
    workInProgress: DecimalString[];
    finishedProducts: DecimalString[];
    receivables: DecimalString[];
    cashInHand: DecimalString[];
    shortTermDeposits: DecimalString[];
    currentAssets: DecimalString[];
    /** Book values net of depreciation and of assets sold. */
    fixedInvestment: DecimalString[];
    preProduction: DecimalString[];
    preProductionInterest: DecimalString[];
    /** Cumulative depreciation allowances, deducted from the fixed assets. */
    depreciationAllowances: DecimalString[];
    fixedAssets: DecimalString[];
    /** Cumulative retained profit when negative. */
    accumulatedLosses: DecimalString[];
    /** Cumulative exchange adjustment of foreign loans when it is a loss. */
    exchangeLosses: DecimalString[];
    total: DecimalString[];
  };
  liabilities: {
    accountsPayable: DecimalString[];
    automaticOverdraft: DecimalString[];
    currentLiabilities: DecimalString[];
    longTermDebt: DecimalString[];
    equity: Record<EquityClass, DecimalString[]>;
    automaticEquity: DecimalString[];
    totalEquity: DecimalString[];
    /** Cumulative retained profit when positive. */
    reserves: DecimalString[];
    exchangeGains: DecimalString[];
    total: DecimalString[];
  };
  /** Total equity plus cumulative retained profit, less exchange losses (plus gains). */
  netWorth: DecimalString[];
}

/**
 * The balance sheet of an existing enterprise on the day before the first period (VII.T). The
 * entered balances need not balance: the difference is reserves (retained profit) when positive
 * and accumulated losses when negative, so both sides are equal.
 */
export interface StartingBalanceSheet {
  assets: {
    cashSurplus: DecimalString;
    materials: DecimalString;
    workInProgress: DecimalString;
    finishedProducts: DecimalString;
    receivables: DecimalString;
    cashInHand: DecimalString;
    shortTermDeposits: DecimalString;
    currentAssets: DecimalString;
    fixedInvestment: DecimalString;
    preProduction: DecimalString;
    fixedAssets: DecimalString;
    accumulatedLosses: DecimalString;
    total: DecimalString;
  };
  liabilities: {
    accountsPayable: DecimalString;
    currentLiabilities: DecimalString;
    longTermDebt: DecimalString;
    equity: Record<EquityClass, DecimalString>;
    totalEquity: DecimalString;
    reserves: DecimalString;
    total: DecimalString;
  };
  netWorth: DecimalString;
}

/**
 * The cash flow of one shareholder (XI.F, X.C.6 «partner capital invested»): dividends and
 * refunds of equity against the equity paid in, the starting equity on the day before the project
 * and the share of the net worth after the last production period.
 */
export interface ShareholderCashFlow extends DiscountedCashFlow {
  /** Key of the equity contribution. */
  equity: string;
  class: EquityClass;
  /** Preferred and ordinary dividends per period. */
  dividends: DecimalString[];
  refunds: DecimalString[];
  /** Warnings about this flow's indicators (no IRR, no payback …). */
  warnings: CalculationWarning[];
}

export interface FinancialStatements {
  incomeStatement: IncomeStatement;
  /** Tax computation of every financial year of production. */
  taxYears: TaxYear[];
  dividends: {
    shareholders: {
      equity: string;
      preferred: DecimalString[];
      ordinary: DecimalString[];
      /** Part of the dividends that leaves the country. */
      repatriated: DecimalString[];
    }[];
    total: DecimalString[];
  };
  cashFlow: CashFlowForPlanning;
  balanceSheet: BalanceSheet;
  /** Expansion and rehabilitation projects only. */
  startingBalance?: StartingBalanceSheet;
  /**
   * The cash flow of every shareholder, when the distribution of the net worth was entered. The
   * residual value is the shareholder's part of the net worth of the last balance sheet.
   */
  shareholders?: ShareholderCashFlow[];
  totalCapital: DiscountedCashFlow & {
    /** Fixed investment + pre-production expenditures + increase of net working capital. */
    investment: DecimalString[];
    npvRatio?: NpvRatioValue;
  };
  equity: DiscountedCashFlow;
  /**
   * Break-even of every production period (null in construction), and of the selected financial
   * year of production as a whole (the reference year unless the user chooses another).
   */
  breakEven: { periods: (BreakEvenValue | null)[]; selectedYear: number; selected: BreakEvenValue };
  debtService: DebtServiceCoverageValue | null;
  /** Ratios per period; null when a ratio cannot be computed. */
  ratios: {
    netProfitToSales: (DecimalString | null)[];
    /** Net profit over the paid-in equity capital (without subsidies). */
    netProfitToEquity: (DecimalString | null)[];
    netProfitToNetWorth: (DecimalString | null)[];
    longTermDebtToNetWorth: (DecimalString | null)[];
    currentRatio: (DecimalString | null)[];
  };
}

/** Relative size below which a difference is a rounding residue of the 34-digit arithmetic. */
const ROUNDING_TOLERANCE = '0.0000000000000000000000000001';

type Row = Decimal[];
const at = (row: Row | undefined, j: number) => row?.[j] ?? ZERO;
const strings = (row: Row) => row.map((v) => toDecimalString(v));
const positive = (row: Row) => row.map((v) => (v.gt(0) ? v : ZERO));
const negative = (row: Row) => row.map((v) => (v.isNegative() ? v.neg() : ZERO));
const cumulative = (row: Row) => {
  let sum = ZERO;
  return row.map((v) => (sum = sum.plus(v)));
};
const increase = (row: Row, opening: Decimal = ZERO) =>
  row.map((v, j) => v.minus(j === 0 ? opening : at(row, j - 1)));
const ratio = (numerator: Decimal, denominator: Decimal) =>
  denominator.isZero() ? null : toDecimalString(numerator.div(denominator));

function yearIndex(value: number, years: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= years) {
    throw new EngineInputError('horizon.outOfRange', field, { min: '0', max: String(years - 1) });
  }
}

/** One annual discount rate per project period, from one rate or a rate path. */
export function discountRates(
  value: DecimalString | DecimalString[],
  periods: number,
  field: string,
): DecimalString[] {
  const check = (rate: DecimalString, at_: string) => {
    if (toDecimal(rate).lte(-1)) throw new EngineInputError('rate.notAboveMinus100', at_);
    return rate;
  };
  if (typeof value === 'string') {
    check(value, field);
    return Array.from({ length: periods }, () => value);
  }
  if (value.length !== periods) {
    throw new EngineInputError('rate.pathLengthMismatch', field, {
      expected: String(periods),
      actual: String(value.length),
    });
  }
  return value.map((rate, j) => check(rate, `${field}[${j}]`));
}

/** Net income statement, cash flows, balance sheet and indicators of the project. */
export function financialStatements(
  input: StatementsInput,
): CalculationResult<FinancialStatements> {
  const { horizon, investment, financing, operations } = input;
  const periods = horizon.periods;
  const length = periods.length;
  const years = horizon.balanceYears.length;
  const production = periods.map((p) => p.phase !== 'CONSTRUCTION');
  const warnings: CalculationWarning[] = [];
  const defaultsUsed: DefaultUsed[] = [];

  const row = (values: DecimalString[], field: string): Row => {
    if (values.length !== length) {
      throw new EngineInputError('series.lengthMismatch', field, {
        expected: String(length),
        actual: String(values.length),
      });
    }
    return values.map((v) => toDecimal(v));
  };
  const zeros: Row = periods.map(() => ZERO);
  const add = (...rows: Row[]): Row =>
    zeros.map((_, j) => rows.reduce((s, r) => s.plus(at(r, j)), ZERO));
  const minus = (a: Row, b: Row): Row => a.map((v, j) => v.minus(at(b, j)));
  /** Financial year of production of each production period (the year whose balance date it holds or precedes). */
  const yearOf = periods.map((_, j) =>
    production[j] === true ? horizon.balanceYears.findIndex((y) => y.period >= j) : -1,
  );
  const balancePeriod = (y: number) => horizon.balanceYears[y]?.period ?? length - 1;
  const productionOnly = (values: DecimalString[], field: string): Row => {
    const parsed = periodAmounts(values, length, field);
    parsed.forEach((v, j) => {
      if (production[j] !== true && !v.isZero()) {
        throw new EngineInputError('statements.productionOnly', `${field}[${j}]`);
      }
    });
    return parsed;
  };

  yearIndex(input.referenceYear, years, 'referenceYear');
  if (input.breakEvenYear !== undefined) yearIndex(input.breakEvenYear, years, 'breakEvenYear');
  const timing = input.residualValueTiming ?? 'YEAR_AFTER_PRODUCTION';
  if (timing !== 'YEAR_AFTER_PRODUCTION' && timing !== 'END_OF_PRODUCTION') {
    throw new EngineInputError('statements.residualValueTiming', 'residualValueTiming');
  }
  const reference = input.discounting.reference;
  if (
    reference !== undefined &&
    reference !== 'START_OF_FIRST_PERIOD' &&
    reference !== 'END_OF_FIRST_YEAR'
  ) {
    throw new EngineInputError('statements.option', 'discounting.reference');
  }
  if (
    input.automaticCashCoverage !== undefined &&
    typeof input.automaticCashCoverage !== 'boolean'
  ) {
    throw new EngineInputError('statements.option', 'automaticCashCoverage');
  }
  const scope = input.indicatorScope ?? 'ALL';
  if (scope !== 'ALL' && scope !== 'NPV' && scope !== 'NPV_AND_IRR') {
    throw new EngineInputError('statements.option', 'indicatorScope');
  }
  const totalCapitalRates = discountRates(
    input.discounting.totalCapitalRate,
    length,
    'discounting.totalCapitalRate',
  );
  const equityRates = discountRates(input.discounting.equityRate, length, 'discounting.equityRate');

  // Schedules.
  const revenue = row(operations.sales.revenue, 'operations.sales.revenue');
  const sold = operations.costs.sold;
  const variableCosts = row(sold.variable, 'operations.costs.sold.variable');
  const fixedCosts = row(sold.fixed, 'operations.costs.sold.fixed');
  const depositInterest = row(operations.depositInterest, 'operations.depositInterest');
  const wc = operations.workingCapital;
  const currentAssets = row(wc.totals.currentAssets, 'operations.workingCapital.totals');
  const payables = row(wc.totals.currentLiabilities, 'operations.workingCapital.totals');
  const fixedInvestment = row(investment.fixedInvestment, 'investment.fixedInvestment');
  const preProduction = row(investment.preProduction, 'investment.preProduction');
  const equityPaid = row(financing.equity.total, 'financing.equity.total');
  const equityRefunds = row(financing.equity.refunds.total, 'financing.equity.refunds.total');
  // What the refunds take off the equity: its paid-in value (a foreign contribution refunded at
  // another rate leaves an exchange difference).
  const refundsAtCost = row(
    financing.equity.refunds.atCost.total,
    'financing.equity.refunds.atCost.total',
  );
  const loanRows = financing.loanTotals;
  if (loanRows.length !== length) {
    throw new EngineInputError('series.lengthMismatch', 'financing.loanTotals', {
      expected: String(length),
      actual: String(loanRows.length),
    });
  }
  const loan = (key: keyof (typeof loanRows)[number]): Row =>
    loanRows.map((p) => toDecimal(p[key]));
  const disbursement = loan('disbursement');
  const capitalised = loan('capitalisedInterest');
  const interestPaid = loan('interest');
  const fees = loan('fees');
  const repayment = loan('repayment');
  const debt = loan('endingBalance');
  const preProductionInterest = row(
    financing.preProductionInterest,
    'financing.preProductionInterest',
  );

  // Starting balances of an existing enterprise (VII.T); all zero for a new project.
  const expansion =
    input.startingCash !== undefined ||
    investment.startingBalance !== undefined ||
    financing.startingBalance !== undefined ||
    wc.starting !== undefined;
  const openingOf = (value: DecimalString | undefined) => toDecimal(value ?? '0');
  const opening = {
    cash: startingAmount(input.startingCash ?? '0', 'startingCash'),
    fixedInvestment: openingOf(investment.startingBalance?.fixed),
    preProduction: openingOf(investment.startingBalance?.preProduction),
    currentAssets: openingOf(wc.starting?.opening.currentAssets),
    payables: openingOf(wc.starting?.opening.currentLiabilities),
    debt: openingOf(financing.startingBalance?.debt),
    equity: openingOf(financing.startingBalance?.totalEquity),
    subsidies: openingOf(financing.startingBalance?.equity.SUBSIDY),
  };
  const openingFixedAssets = opening.fixedInvestment.plus(opening.preProduction);
  // Assets less liabilities and equity: reserves when positive, accumulated losses when negative.
  const openingReserves = openingFixedAssets
    .plus(opening.currentAssets)
    .plus(opening.cash)
    .minus(opening.payables)
    .minus(opening.debt)
    .minus(opening.equity);

  // Sale of assets (XI.I): the item stops being depreciated and leaves the books at the sale.
  const sales = input.assetSales ?? [];
  uniqueKeys(
    sales.map((s) => s.item),
    'assetSales',
    'item',
  );
  const proceeds = [...zeros];
  const extraordinary = [...zeros];
  let assetDepreciation = row(investment.depreciation.total, 'investment.depreciation.total');
  let fixedBook = row(investment.bookValue.fixed, 'investment.bookValue.fixed');
  let preProductionBook = row(investment.bookValue.preProduction, 'investment.bookValue');
  sales.forEach((sale, i) => {
    const field = `assetSales[${i}]`;
    const item = investment.items.find((x) => x.key === sale.item);
    if (item === undefined) throw new EngineInputError('assetSale.unknownItem', `${field}.item`);
    const period = periods[sale.period];
    if (
      !Number.isInteger(sale.period) ||
      period === undefined ||
      period.phase === 'CONSTRUCTION' ||
      !period.balanceDate
    ) {
      throw new EngineInputError('assetSale.period', `${field}.period`);
    }
    const price = toDecimal(sale.proceeds);
    if (price.isNegative()) throw new EngineInputError('amount.negative', `${field}.proceeds`);
    const acquired = row(item.amounts, `investment.items.${item.key}.amounts`);
    if (acquired.some((a, j) => j > sale.period && !a.isZero())) {
      throw new EngineInputError('assetSale.acquisitionAfterSale', `${field}.period`);
    }
    const book = row(item.bookValue, `investment.items.${item.key}.bookValue`);
    const charge = row(item.depreciation, `investment.items.${item.key}.depreciation`);
    const after = (values: Row): Row => values.map((v, j) => (j > sale.period ? v : ZERO));
    const gone: Row = book.map((v, j) => (j >= sale.period ? v : ZERO));
    proceeds[sale.period] = at(proceeds, sale.period).plus(price);
    extraordinary[sale.period] = at(extraordinary, sale.period)
      .plus(price)
      .minus(at(book, sale.period));
    assetDepreciation = minus(assetDepreciation, after(charge));
    if (item.group === 'PRE_PRODUCTION') preProductionBook = minus(preProductionBook, gone);
    else fixedBook = minus(fixedBook, gone);
  });

  const none = periods.map(() => '0');
  const investmentAllowance = productionOnly(
    input.allowances?.investment ?? none,
    'allowances.investment',
  );
  const depreciationAllowance = productionOnly(
    input.allowances?.depreciation ?? none,
    'allowances.depreciation',
  );
  // Depreciation allowances (XI.R) write assets off early: what they have written off is not
  // depreciated again. The ordinary charge of a period is reduced as far as the book value of
  // fixed investment and pre-production expenditures would otherwise fall below the allowances
  // granted; an allowance beyond what is left to write off is refused.
  const granted = cumulative(depreciationAllowance);
  const replaced = [...zeros];
  let replacedToDate = ZERO;
  let lastAllowance = 0;
  const allowancesToDate = granted.map((allowance, j) => {
    if (!at(depreciationAllowance, j).isZero()) lastAllowance = j;
    const short = allowance
      .minus(at(fixedBook, j))
      .minus(at(preProductionBook, j))
      .minus(replacedToDate);
    if (short.gt(0)) {
      const charge = at(assetDepreciation, j);
      // Book values and charges are rounded to 34 digits independently, so a shortfall may
      // exceed the period's charge by a rounding residue; only a real excess is refused.
      if (short.minus(charge).gt(allowance.times(ROUNDING_TOLERANCE))) {
        throw new EngineInputError(
          'allowance.exceedsBookValue',
          `allowances.depreciation[${lastAllowance}]`,
        );
      }
      const covered = short.gt(charge) ? charge : short;
      replaced[j] = covered;
      replacedToDate = replacedToDate.plus(covered);
    }
    return allowance.minus(replacedToDate);
  });
  const depreciation = add(
    minus(assetDepreciation, replaced),
    row(financing.interestDepreciation, 'financing.interestDepreciation'),
  );
  const interestBook = row(financing.interestBookValue, 'financing.interestBookValue');
  const fixedAssets = minus(add(fixedBook, preProductionBook, interestBook), allowancesToDate);

  // Net income statement (X.C.6). Interest and fees that are pre-production expenditures
  // (capitalised, or paid in construction) are assets, not costs of the period.
  const financialCosts = minus(add(interestPaid, fees, capitalised), preProductionInterest);
  const variableMargin = minus(revenue, variableCosts);
  const operationalMargin = minus(variableMargin, add(fixedCosts, depreciation));
  const grossFromOperations = minus(add(operationalMargin, depositInterest), financialCosts);
  const grossProfit = minus(add(grossFromOperations, extraordinary), depreciationAllowance);

  // Income tax per financial year (XI.P), booked at the balance date.
  const yearly = (values: Row): Row =>
    horizon.balanceYears.map((_, y) =>
      values.reduce((s, v, j) => (yearOf[j] === y ? s.plus(v) : s), ZERO),
    );
  const taxYears = withField('tax', () =>
    incomeTax(strings(yearly(minus(grossProfit, investmentAllowance))), input.tax),
  ).value;
  const atBalance = (pick: (year: TaxYear) => DecimalString): Row => {
    const values = [...zeros];
    taxYears.forEach((year, y) => {
      values[balancePeriod(y)] = toDecimal(pick(year));
    });
    return values;
  };
  const tax = atBalance((y) => y.tax);
  const netProfit = minus(grossProfit, tax);

  // Dividends per financial year (XI.Q), paid at the balance date.
  const notNegative = (value: Decimal, field: string) => {
    if (value.isNegative()) throw new EngineInputError('amount.negative', field);
  };
  const share = (value: Decimal, field: string) => {
    if (value.isNegative() || value.gt(1)) throw new EngineInputError('share.outOfRange', field);
  };
  const distribution = input.profitDistribution;
  const retainedShare = perYear(
    distribution.retainedShare,
    years,
    'profitDistribution.retainedShare',
    share,
  );
  uniqueKeys(
    distribution.shareholders.map((s) => s.equity),
    'profitDistribution.shareholders',
    'equity',
  );
  const shareholders = distribution.shareholders.map((s, i) => {
    const field = `profitDistribution.shareholders[${i}]`;
    const equity = financing.equity.items.find((e) => e.key === s.equity);
    if (equity === undefined) {
      throw new EngineInputError('dividends.unknownEquity', `${field}.equity`);
    }
    if (equity.class === 'SUBSIDY') {
      throw new EngineInputError('dividends.subsidy', `${field}.equity`);
    }
    const repatriated = toDecimal(s.repatriatedShare);
    share(repatriated, `${field}.repatriatedShare`);
    const netWorthShare = s.netWorthShare === undefined ? undefined : toDecimal(s.netWorthShare);
    if (netWorthShare !== undefined) share(netWorthShare, `${field}.netWorthShare`);
    const paid = row(equity.amounts, `financing.equity.items.${equity.key}`);
    const refunded =
      equity.refunds === undefined
        ? zeros
        : row(equity.refunds, `financing.equity.items.${equity.key}.refunds`);
    const refundedAtCost =
      equity.refundsAtCost === undefined
        ? zeros
        : row(equity.refundsAtCost, `financing.equity.items.${equity.key}.refundsAtCost`);
    return {
      key: s.equity,
      class: equity.class,
      jointVenture: equity.class === 'JOINT_VENTURE',
      paid,
      refunded,
      startingEquity: openingOf(equity.startingBalance),
      netWorthShare,
      // Preferred dividends are paid on the equity held: the starting balance included, refunds
      // deducted.
      accumulated: cumulative(minus(paid, refundedAtCost)).map((v) =>
        v.plus(openingOf(equity.startingBalance)),
      ),
      preferredRate: perYear(s.preferredRate, years, `${field}.preferredRate`, notNegative),
      preferredAmount: perYear(s.preferredAmount, years, `${field}.preferredAmount`, notNegative),
      ordinaryShare: perYear(s.ordinaryShare, years, `${field}.ordinaryShare`, share),
      repatriated,
      preferred: [...zeros],
      ordinary: [...zeros],
    };
  });
  const yearlyNetProfit = yearly(netProfit);
  const dividends = [...zeros];
  horizon.balanceYears.forEach((_, y) => {
    const retained = at(retainedShare, y);
    const ordinaryShares = shareholders.reduce((s, h) => s.plus(at(h.ordinaryShare, y)), ZERO);
    if (retained.lt(1) && !ordinaryShares.eq(1)) {
      throw new EngineInputError('dividends.ordinaryShares', 'profitDistribution.shareholders', {
        year: String(y + 1),
      });
    }
    const j = balancePeriod(y);
    const result = distributeProfit(
      at(yearlyNetProfit, y),
      retained,
      shareholders.map((h): DividendShareholder => ({
        jointVenture: h.jointVenture,
        accumulatedEquity: at(h.accumulated, j),
        preferredRate: at(h.preferredRate, y),
        preferredAmount: at(h.preferredAmount, y),
        ordinaryShare: at(h.ordinaryShare, y),
      })),
    );
    result.shareholders.forEach((paid, i) => {
      const holder = shareholders[i];
      if (holder === undefined) return;
      holder.preferred[j] = paid.preferred;
      holder.ordinary[j] = paid.ordinary;
    });
    dividends[j] = result.dividends;
  });
  const retainedProfit = minus(netProfit, dividends);

  // Cash flow for financial planning (X.C.6), before the automatic coverage of deficits.
  const loansIn = add(disbursement, capitalised);
  const payablesIncrease = increase(payables, opening.payables);
  const currentAssetsIncrease = increase(currentAssets, opening.currentAssets);
  const financialOutflow = add(interestPaid, capitalised, fees);
  const operatingCosts = row(sold.operatingCosts, 'operations.costs.sold.operatingCosts');
  const leasingCosts = row(sold.leasing, 'operations.costs.sold.leasing');
  const marketingCosts = row(sold.marketing, 'operations.costs.sold.marketing');
  const inflow = add(equityPaid, loansIn, payablesIncrease, revenue, depositInterest, proceeds);
  const outflow = add(
    fixedInvestment,
    preProduction,
    currentAssetsIncrease,
    operatingCosts,
    leasingCosts,
    marketingCosts,
    tax,
    financialOutflow,
    repayment,
    dividends,
    equityRefunds,
  );
  const surplus = minus(inflow, outflow);

  // Cash deficit (XI.N): equity in construction, an interest-free overdraft in production that is
  // repaid from the earliest surpluses. Both are labelled lines here, never hidden.
  const coverage = input.automaticCashCoverage ?? true;
  if (input.automaticCashCoverage === undefined) {
    defaultsUsed.push({ key: 'cash.autoCoverage', value: 'ON' });
  }
  const automaticEquity = [...zeros];
  const overdraftFlow = [...zeros];
  const overdraftBalance: Row = [];
  const cash: Row = [];
  const deficitPeriods: number[] = [];
  let balance = opening.cash;
  let overdraft = ZERO;
  surplus.forEach((s, j) => {
    balance = balance.plus(s);
    if (balance.isNegative()) {
      deficitPeriods.push(j + 1);
      if (coverage) {
        if (production[j] === true) {
          overdraftFlow[j] = balance.neg();
          overdraft = overdraft.plus(balance.neg());
        } else {
          automaticEquity[j] = balance.neg();
        }
        balance = ZERO;
      }
    } else if (overdraft.gt(0)) {
      const repaid = overdraft.gt(balance) ? balance : overdraft;
      overdraftFlow[j] = repaid.neg();
      overdraft = overdraft.minus(repaid);
      balance = balance.minus(repaid);
    }
    overdraftBalance.push(overdraft);
    cash.push(balance);
  });
  if (deficitPeriods.length > 0) {
    warnings.push({
      code: coverage ? 'cash.underFinanced' : 'cash.deficit',
      params: { periods: deficitPeriods.join('، ') },
    });
  }

  // Projected balance sheet (X.C.6).
  const wcRow = (values: DecimalString[]) => row(values, 'operations.workingCapital');
  const equityToDate = cumulative(minus(equityPaid, refundsAtCost)).map((v) =>
    v.plus(opening.equity),
  );
  const automaticEquityToDate = cumulative(automaticEquity);
  const totalEquity = add(equityToDate, automaticEquityToDate);
  const retainedToDate = cumulative(retainedProfit).map((v) => v.plus(openingReserves));
  // Exchange adjustment of foreign loans, and of foreign equity refunded at another rate than
  // it was paid in at (cash paid less the equity taken off the books).
  const exchangeToDate = cumulative(
    add(loan('exchangeAdjustment'), minus(equityRefunds, refundsAtCost)),
  );
  const allCurrentAssets = add(cash, currentAssets);
  const currentLiabilities = add(payables, overdraftBalance);
  const totalAssets = add(
    allCurrentAssets,
    fixedAssets,
    negative(retainedToDate),
    positive(exchangeToDate),
  );
  const totalLiabilities = add(
    currentLiabilities,
    debt,
    totalEquity,
    positive(retainedToDate),
    negative(exchangeToDate),
  );
  const netWorth = minus(add(totalEquity, retainedToDate), exchangeToDate);
  const startingBalanceSheet = (): StartingBalanceSheet => {
    const start = wc.starting?.opening;
    const currentAssetsAtStart = opening.currentAssets.plus(opening.cash);
    const losses = openingReserves.isNegative() ? openingReserves.neg() : ZERO;
    const reserves = openingReserves.gt(0) ? openingReserves : ZERO;
    const text = toDecimalString;
    return {
      assets: {
        cashSurplus: text(opening.cash),
        materials: start?.materials ?? '0',
        workInProgress: start?.workInProgress ?? '0',
        finishedProducts: start?.finishedProducts ?? '0',
        receivables: start?.receivables ?? '0',
        cashInHand: start?.cashInHand ?? '0',
        shortTermDeposits: start?.shortTermDeposits ?? '0',
        currentAssets: text(currentAssetsAtStart),
        fixedInvestment: text(opening.fixedInvestment),
        preProduction: text(opening.preProduction),
        fixedAssets: text(openingFixedAssets),
        accumulatedLosses: text(losses),
        total: text(currentAssetsAtStart.plus(openingFixedAssets).plus(losses)),
      },
      liabilities: {
        accountsPayable: text(opening.payables),
        currentLiabilities: text(opening.payables),
        longTermDebt: text(opening.debt),
        equity: Object.fromEntries(
          EQUITY_CLASSES.map((c) => [c, text(openingOf(financing.startingBalance?.equity[c]))]),
        ) as Record<EquityClass, DecimalString>,
        totalEquity: text(opening.equity),
        reserves: text(reserves),
        total: text(opening.payables.plus(opening.debt).plus(opening.equity).plus(reserves)),
      },
      netWorth: text(opening.equity.plus(openingReserves)),
    };
  };

  // Discounted cash flows (XI.F). Residual values return in the year after production (COMFAR
  // default) or on the last day of production.
  if (input.residualValueTiming === undefined) {
    defaultsUsed.push({ key: 'assets.residualValuePeriod', value: timing });
  }
  const salvageColumn = timing === 'YEAR_AFTER_PRODUCTION';
  const last = length - 1;
  const workingCapitalIncrease = minus(currentAssetsIncrease, payablesIncrease);
  const liquidation = toDecimal(wc.liquidation);
  const residualTotalCapital = at(fixedAssets, last)
    .minus(at(interestBook, last))
    .plus(liquidation);
  const residualEquity = at(fixedAssets, last).plus(liquidation).minus(at(debt, last));
  const months = periods.map((p) => p.months);
  const flow = (
    basis: 'totalCapital' | 'equity',
    inflows: Row,
    outflows: Row,
    residual: Decimal,
    rates: DecimalString[],
    startingBalance: Decimal,
  ): DiscountedFlow & { result: DiscountedCashFlow } => {
    const calculated = discountedFlow({
      basis,
      net: minus(inflows, outflows),
      residual,
      ...(expansion ? { startingBalance } : {}),
      months,
      rates,
      salvageColumn,
      ...(reference === undefined ? {} : { reference }),
      ...(input.discounting.reinvestmentRate === undefined
        ? {}
        : { reinvestmentRate: input.discounting.reinvestmentRate }),
      ...(input.discounting.borrowingRate === undefined
        ? {}
        : { borrowingRate: input.discounting.borrowingRate }),
      scope,
    });
    warnings.push(...calculated.warnings);
    for (const d of calculated.defaultsUsed) {
      if (d.key !== 'discounting.referenceDate' || !defaultsUsed.some((x) => x.key === d.key)) {
        defaultsUsed.push(d);
      }
    }
    return {
      ...calculated,
      result: { ...calculated.result, inflow: strings(inflows), outflow: strings(outflows) },
    };
  };

  // Total capital: the planning cash flow without any financial transaction.
  const totalInvestment = add(fixedInvestment, preProduction, workingCapitalIncrease);
  // XI.F: fixed assets plus current assets less current liabilities of the starting balance.
  const totalCapitalCharge = openingFixedAssets
    .plus(opening.currentAssets)
    .plus(opening.cash)
    .minus(opening.payables);
  const totalCapital = flow(
    'totalCapital',
    add(revenue, depositInterest, proceeds),
    add(totalInvestment, operatingCosts, leasingCosts, marketingCosts, tax),
    residualTotalCapital,
    totalCapitalRates,
    totalCapitalCharge,
  );
  const investmentColumns = salvageColumn ? [...totalInvestment, ZERO] : totalInvestment;
  // The starting balance the flow is charged with is capital committed like the investments: the
  // current assets it holds return as negative increases of working capital in later periods, so
  // leaving it out would net the investment down (our rule, OQ-39).
  const npvrColumns = totalCapital.openingColumn
    ? [totalCapitalCharge, ...investmentColumns]
    : investmentColumns;
  const npvr = npvRatio(totalCapital.series, strings(npvrColumns), {
    annualRate: totalCapital.rates,
    ...(reference === undefined ? {} : { reference }),
  });
  for (const w of npvr.warnings)
    warnings.push({ ...w, params: { ...w.params, basis: 'totalCapital' } });

  // Equity: the surplus with dividends added back, against the net equity contribution — equity
  // paid in (net of subsidies) less equity refunded (X.C.6).
  const subsidies = row(financing.equity.classes.SUBSIDY, 'financing.equity.classes.SUBSIDY');
  const equity = flow(
    'equity',
    add(surplus, dividends, equityRefunds),
    minus(equityPaid, subsidies),
    residualEquity,
    equityRates,
    // XI.F: the starting equity (subsidies are not equity capital, as for the paid-in equity).
    opening.equity.minus(opening.subsidies),
  );

  // Break-even of every production period (X.C.6); the selected year defaults to the reference year.
  if (input.breakEvenYear === undefined) {
    defaultsUsed.push({ key: 'breakEven.period', value: String(input.referenceYear + 1) });
  }
  const breakEvenOf = (rows: [Row, Row, Row, Row], k: number, field: string) =>
    withField(field, () =>
      breakEven({
        salesRevenue: toDecimalString(at(rows[0], k)),
        variableCosts: toDecimalString(at(rows[1], k)),
        fixedCosts: toDecimalString(at(rows[2], k)),
        financialCosts: toDecimalString(at(rows[3], k)),
      }),
    );
  const breakEvenRows: [Row, Row, Row, Row] = [
    revenue,
    variableCosts,
    add(fixedCosts, depreciation),
    financialCosts,
  ];
  const breakEvenPeriods = periods.map((_, j) =>
    production[j] === true ? breakEvenOf(breakEvenRows, j, `breakEven[${j}]`).value : null,
  );
  // The selected year is analysed as a whole: yearly amounts such as depreciation are booked in
  // one period of the year, so a single start-up period would not be comparable.
  const selectedYear = input.breakEvenYear ?? input.referenceYear;
  const selected = breakEvenOf(
    [
      yearly(breakEvenRows[0]),
      yearly(breakEvenRows[1]),
      yearly(breakEvenRows[2]),
      yearly(breakEvenRows[3]),
    ],
    selectedYear,
    'breakEven',
  );
  for (const w of selected.warnings) {
    warnings.push({ ...w, params: { ...w.params, year: String(selectedYear + 1) } });
  }

  // Long-term debt-service coverage (X.C.7).
  const hasDebtService = add(repayment, interestPaid, fees).some((v) => !v.isZero());
  const debtService = hasDebtService
    ? debtServiceCoverage(
        periods.map((_, j) => ({
          cashSurplus: toDecimalString(at(surplus, j)),
          repayment: toDecimalString(at(repayment, j)),
          interest: toDecimalString(at(interestPaid, j)),
          otherFinancialCosts: toDecimalString(at(fees, j)),
        })),
      ).value
    : null;

  const equityCapital = cumulative(minus(minus(equityPaid, subsidies), refundsAtCost)).map((v) =>
    v.plus(opening.equity).minus(opening.subsidies),
  );

  // Cash flow of every shareholder (XI.F): −E_SB − equity paid in + refunds + dividends, and the
  // shareholder's part of the net worth when residual values return.
  const withShare = shareholders.filter((h) => h.netWorthShare !== undefined);
  if (withShare.length > 0) {
    if (withShare.length !== shareholders.length) {
      const missing = shareholders.findIndex((h) => h.netWorthShare === undefined);
      throw new EngineInputError(
        'shareholders.netWorthShareRequired',
        `profitDistribution.shareholders[${missing}].netWorthShare`,
      );
    }
    const total = withShare.reduce((s, h) => s.plus(h.netWorthShare ?? ZERO), ZERO);
    if (!total.eq(1)) {
      throw new EngineInputError('shareholders.netWorthShares', 'profitDistribution.shareholders');
    }
  }
  if (withShare.length > 0) {
    // The net worth is shared among the listed shareholders only: what distorts their returns is
    // said, never hidden.
    const unlisted = financing.equity.items
      .filter((e) => e.class !== 'SUBSIDY' && !shareholders.some((h) => h.key === e.key))
      .map((e) => e.key);
    if (unlisted.length > 0) {
      warnings.push({
        code: 'shareholders.contributionWithoutShare',
        params: { items: unlisted.join('، ') },
      });
    }
    const automatic = at(automaticEquityToDate, last);
    if (!automatic.isZero()) {
      warnings.push({
        code: 'shareholders.automaticEquity',
        params: { amount: toDecimalString(automatic) },
      });
    }
  }
  const finalNetWorth = at(netWorth, last);
  const shareholderFlows = withShare.map((h): ShareholderCashFlow => {
    const received = add(h.preferred, h.ordinary);
    const inflows = add(received, h.refunded);
    const calculated = discountedFlow({
      basis: 'equity',
      net: minus(inflows, h.paid),
      residual: finalNetWorth.times(h.netWorthShare ?? ZERO),
      ...(expansion ? { startingBalance: h.startingEquity } : {}),
      months,
      rates: equityRates,
      salvageColumn,
      ...(reference === undefined ? {} : { reference }),
      ...(input.discounting.reinvestmentRate === undefined
        ? {}
        : { reinvestmentRate: input.discounting.reinvestmentRate }),
      ...(input.discounting.borrowingRate === undefined
        ? {}
        : { borrowingRate: input.discounting.borrowingRate }),
      scope,
    });
    return {
      equity: h.key,
      class: h.class,
      ...calculated.result,
      inflow: strings(inflows),
      outflow: strings(h.paid),
      dividends: strings(received),
      refunds: strings(h.refunded),
      // The warnings name the shareholder instead of a basis of the project.
      warnings: calculated.warnings.map((w) => {
        const { basis: _basis, ...params } = w.params ?? {};
        return { code: w.code, params: { ...params, item: h.key } };
      }),
    };
  });
  const perPeriod = (numerator: Row, denominator: Row) =>
    numerator.map((v, j) => ratio(v, at(denominator, j)));
  const equityClasses = Object.fromEntries(
    EQUITY_CLASSES.map((c) => [
      c,
      strings(
        cumulative(
          minus(
            row(financing.equity.classes[c], `financing.equity.classes.${c}`),
            row(
              financing.equity.refunds.atCost.classes[c],
              `financing.equity.refunds.atCost.classes.${c}`,
            ),
          ),
        ).map((v) => v.plus(openingOf(financing.startingBalance?.equity[c]))),
      ),
    ]),
  ) as Record<EquityClass, DecimalString[]>;

  const value: FinancialStatements = {
    incomeStatement: {
      salesRevenue: strings(revenue),
      variableCosts: strings(variableCosts),
      variableMargin: strings(variableMargin),
      fixedCosts: strings(fixedCosts),
      depreciation: strings(depreciation),
      operationalMargin: strings(operationalMargin),
      depositInterest: strings(depositInterest),
      financialCosts: strings(financialCosts),
      grossProfitFromOperations: strings(grossFromOperations),
      extraordinaryIncome: strings(positive(extraordinary)),
      extraordinaryLoss: strings(negative(extraordinary)),
      depreciationAllowance: strings(depreciationAllowance),
      grossProfit: strings(grossProfit),
      investmentAllowance: strings(investmentAllowance),
      deductibleLoss: strings(atBalance((y) => y.deductibleLoss)),
      taxableProfit: strings(atBalance((y) => y.taxableProfit)),
      incomeTax: strings(tax),
      netProfit: strings(netProfit),
      dividends: strings(dividends),
      retainedProfit: strings(retainedProfit),
    },
    taxYears,
    dividends: {
      shareholders: shareholders.map((h) => ({
        equity: h.key,
        preferred: strings(h.preferred),
        ordinary: strings(h.ordinary),
        repatriated: strings(add(h.preferred, h.ordinary).map((v) => v.times(h.repatriated))),
      })),
      total: strings(dividends),
    },
    cashFlow: {
      inflows: {
        equity: strings(equityPaid),
        longTermLoans: strings(loansIn),
        payablesIncrease: strings(payablesIncrease),
        salesRevenue: strings(revenue),
        depositInterest: strings(depositInterest),
        otherIncome: strings(proceeds),
        total: strings(inflow),
      },
      outflows: {
        fixedInvestment: strings(fixedInvestment),
        preProduction: strings(preProduction),
        currentAssetsIncrease: strings(currentAssetsIncrease),
        operatingCosts: strings(operatingCosts),
        leasingCosts: strings(leasingCosts),
        marketingCosts: strings(marketingCosts),
        incomeTax: strings(tax),
        financialCosts: strings(financialOutflow),
        loanRepayments: strings(repayment),
        dividends: strings(dividends),
        equityRefunds: strings(equityRefunds),
        total: strings(outflow),
      },
      surplus: strings(surplus),
      cumulativeSurplus: strings(cumulative(surplus).map((v) => v.plus(opening.cash))),
      automaticEquity: strings(automaticEquity),
      automaticOverdraft: strings(overdraftFlow),
      automaticOverdraftBalance: strings(overdraftBalance),
      cashBalance: strings(cash),
    },
    balanceSheet: {
      assets: {
        cashSurplus: strings(cash),
        materials: strings(wcRow(wc.totals.materials)),
        workInProgress: strings(wcRow(wc.totals.workInProgress)),
        finishedProducts: strings(wcRow(wc.totals.finishedProducts)),
        receivables: strings(wcRow(wc.totals.receivables)),
        cashInHand: strings(wcRow(wc.cash.inHand)),
        shortTermDeposits: strings(wcRow(wc.cash.deposits)),
        currentAssets: strings(allCurrentAssets),
        fixedInvestment: strings(fixedBook),
        preProduction: strings(preProductionBook),
        preProductionInterest: strings(interestBook),
        depreciationAllowances: strings(allowancesToDate),
        fixedAssets: strings(fixedAssets),
        accumulatedLosses: strings(negative(retainedToDate)),
        exchangeLosses: strings(positive(exchangeToDate)),
        total: strings(totalAssets),
      },
      liabilities: {
        accountsPayable: strings(payables),
        automaticOverdraft: strings(overdraftBalance),
        currentLiabilities: strings(currentLiabilities),
        longTermDebt: strings(debt),
        equity: equityClasses,
        automaticEquity: strings(automaticEquityToDate),
        totalEquity: strings(totalEquity),
        reserves: strings(positive(retainedToDate)),
        exchangeGains: strings(negative(exchangeToDate)),
        total: strings(totalLiabilities),
      },
      netWorth: strings(netWorth),
    },
    ...(expansion ? { startingBalance: startingBalanceSheet() } : {}),
    ...(shareholderFlows.length > 0 ? { shareholders: shareholderFlows } : {}),
    totalCapital: {
      ...totalCapital.result,
      investment: strings(investmentColumns),
      ...(npvr.value === undefined ? {} : { npvRatio: npvr.value }),
    },
    equity: equity.result,
    breakEven: { periods: breakEvenPeriods, selectedYear, selected: selected.value },
    debtService,
    ratios: {
      netProfitToSales: perPeriod(netProfit, revenue),
      netProfitToEquity: perPeriod(netProfit, equityCapital),
      netProfitToNetWorth: perPeriod(netProfit, netWorth),
      longTermDebtToNetWorth: perPeriod(debt, netWorth),
      currentRatio: perPeriod(allCurrentAssets, currentLiabilities),
    },
  };
  return { value, modelVersion: MODEL_VERSION, warnings, defaultsUsed };
}
