import { type Decimal, ONE, ZERO, toDecimal, toDecimalString, type DecimalString } from './decimal';
import { EngineInputError } from './errors';
import {
  DEFAULT_DISCOUNT_REFERENCE,
  assertTimedSeries,
  npv,
  periodDiscountFactors,
  type DiscountingOptions,
  type TimedSeries,
} from './time-value';
import type { CalculationResult, CalculationWarning, DefaultUsed } from './types';
import { MODEL_VERSION } from './version';

/**
 * Performance indicators (comfar-model-spec §5.1; manual X.C.6–7): normal and dynamic payback,
 * NPV ratio, break-even, debt-service coverage, plus LLCR, benefit-cost ratio and WACC, which
 * COMFAR does not print but appraisal practice needs. Every ratio that cannot be computed is
 * `undefined` with a warning — never zero (deviation from COMFAR, comfar-model-spec §3.1).
 *
 * Ratios are decimal fractions like every rate in the engine ("0.45" = 45 %); the UI formats them.
 */

function result<T>(
  value: T,
  warnings: CalculationWarning[] = [],
  defaultsUsed: DefaultUsed[] = [],
): CalculationResult<T> {
  return { value, modelVersion: MODEL_VERSION, warnings, defaultsUsed };
}

function nonNegative(value: DecimalString, field: string): Decimal {
  const parsed = toDecimal(value);
  if (parsed.isNegative() && !parsed.isZero()) {
    throw new EngineInputError('amount.negative', field);
  }
  return parsed;
}

function sameLength(values: unknown[], expected: number, field: string): void {
  if (values.length !== expected) {
    throw new EngineInputError('series.lengthMismatch', field, {
      expected: String(expected),
      actual: String(values.length),
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Payback

export interface PaybackValue {
  /** Index (from 0) of the first period whose cumulative amount is positive: COMFAR's payback period. */
  period: number;
  /** Months from the start of the horizon to the end of that period: COMFAR's payback date. */
  endMonth: number;
  /**
   * Months from the start of the horizon to the point where the cumulative amount crosses zero,
   * interpolated linearly inside the payback period (our extension: COMFAR books flows at the end
   * of the period, so its duration is `endMonth`).
   */
  months: DecimalString;
}

export interface PaybackOptions {
  /** Residual value received at the end of the last period (as in `npv`). */
  salvageValue?: DecimalString;
}

/**
 * The cumulative amount must first go below zero (the investment) and then turn positive. A later
 * relapse to zero or below keeps the first payback, as COMFAR does, and adds a warning.
 */
function paybackOf(
  amounts: Decimal[],
  periodMonths: number[],
  salvage: Decimal = ZERO,
): CalculationResult<PaybackValue | undefined> {
  const lastPeriod = amounts.length - 1;
  let cumulative = ZERO;
  let start = 0;
  let invested = false;
  let found: PaybackValue | undefined;
  const warnings: CalculationWarning[] = [];
  amounts.forEach((amount, i) => {
    const months = periodMonths[i] ?? 0;
    const previous = cumulative;
    const operating = cumulative.plus(amount);
    // The salvage value arrives on the last day of the horizon, so it never shifts the
    // interpolated point inside the period: it can only complete the payback at the period end.
    cumulative = i === lastPeriod ? operating.plus(salvage) : operating;
    if (found === undefined) {
      if (cumulative.lt(0)) invested = true;
      else if (invested && cumulative.gt(0)) {
        const end = start + months;
        if (operating.gt(0)) {
          // previous ≤ 0 < operating, so amount > 0 and the fraction lies in [0, 1).
          const fraction = previous.neg().div(amount);
          found = {
            period: i,
            endMonth: end,
            months: toDecimalString(fraction.times(months).plus(start)),
          };
        } else {
          found = { period: i, endMonth: end, months: String(end) };
        }
      }
    } else if (!cumulative.gt(0) && warnings.length === 0) {
      warnings.push({ code: 'payback.notSustained', params: { period: String(i + 1) } });
    }
    start += months;
  });
  if (!invested) return result(undefined, [{ code: 'payback.noInvestment' }]);
  if (found === undefined) return result(undefined, [{ code: 'payback.notReached' }]);
  return result(found, warnings);
}

/** Normal payback period: the first period in which the cumulative net cash flow turns positive. */
export function paybackPeriod(
  series: TimedSeries,
  options: PaybackOptions = {},
): CalculationResult<PaybackValue | undefined> {
  assertTimedSeries(series);
  const salvage = options.salvageValue === undefined ? ZERO : toDecimal(options.salvageValue);
  return paybackOf(
    series.amounts.map((a) => toDecimal(a)),
    series.periodMonths,
    salvage,
  );
}

export interface DynamicPaybackOptions extends PaybackOptions {
  /** Annual discount rate or rate path; required (no economic default). */
  annualRate: DecimalString | DecimalString[];
}

/**
 * Dynamic payback period: the same on the cumulative present value. The discount reference date
 * only scales every present value by one positive constant, so it cannot move the payback and is
 * not an input here.
 */
export function discountedPaybackPeriod(
  series: TimedSeries,
  options: DynamicPaybackOptions,
): CalculationResult<PaybackValue | undefined> {
  assertTimedSeries(series);
  const factors = periodDiscountFactors(series.periodMonths, {
    annualRate: options.annualRate,
    reference: 'START_OF_FIRST_PERIOD',
  });
  const salvage = options.salvageValue === undefined ? ZERO : toDecimal(options.salvageValue);
  const discounted = series.amounts.map((a, i) => toDecimal(a).div(factors[i] ?? ONE));
  const last = factors[factors.length - 1] ?? ONE;
  return paybackOf(discounted, series.periodMonths, salvage.div(last));
}

// ---------------------------------------------------------------------------------------------
// NPV ratio, profitability index, benefit-cost ratio

export interface NpvRatioValue {
  /** NPVR = NPV / PVI (COMFAR). */
  ratio: DecimalString;
  /** PV of the net cash flow before investment over PVI, i.e. `1 + NPVR`. */
  profitabilityIndex: DecimalString;
  npv: DecimalString;
  /** PVI: present value of `FI + PPN + IWC` per period. */
  presentValueOfInvestment: DecimalString;
}

/**
 * Net present value ratio (COMFAR X.C.6): `NPVR = NPV / PVI`. `series` is the net cash flow of the
 * total capital invested (investment included as outflows); `investment[j]` is the total
 * investment of period j — fixed investment + pre-production expenditures + increment of net
 * working capital — as a positive amount, over the project periods plus the salvage period.
 */
export function npvRatio(
  series: TimedSeries,
  investment: DecimalString[],
  options: DiscountingOptions,
): CalculationResult<NpvRatioValue | undefined> {
  assertTimedSeries(series);
  sameLength(investment, series.periodMonths.length, 'investment');
  const present = npv(series, options);
  const factors = periodDiscountFactors(series.periodMonths, options);
  let pvi = ZERO;
  investment.forEach((amount, i) => {
    pvi = pvi.plus(toDecimal(amount).div(factors[i] ?? ONE));
  });
  if (!pvi.gt(0)) {
    return result(undefined, [{ code: 'npvr.noInvestment' }], present.defaultsUsed);
  }
  const ratio = toDecimal(present.value).div(pvi);
  return result(
    {
      ratio: toDecimalString(ratio),
      profitabilityIndex: toDecimalString(ratio.plus(ONE)),
      npv: present.value,
      presentValueOfInvestment: toDecimalString(pvi),
    },
    [],
    present.defaultsUsed,
  );
}

export interface BenefitCostSeries {
  periodMonths: number[];
  /** Benefits (inflows) per period, paid at period end. */
  benefits: DecimalString[];
  /** Costs (outflows) per period as positive amounts, paid at period end. */
  costs: DecimalString[];
}

export interface BenefitCostValue {
  ratio: DecimalString;
  presentValueOfBenefits: DecimalString;
  presentValueOfCosts: DecimalString;
}

/** Benefit-cost ratio: PV of benefits over PV of costs, discounted like `npv`. */
export function benefitCostRatio(
  series: BenefitCostSeries,
  options: Omit<DiscountingOptions, 'salvageValue'>,
): CalculationResult<BenefitCostValue | undefined> {
  sameLength(series.benefits, series.periodMonths.length, 'benefits');
  sameLength(series.costs, series.periodMonths.length, 'costs');
  assertTimedSeries({ periodMonths: series.periodMonths, amounts: series.benefits });
  const factors = periodDiscountFactors(series.periodMonths, options);
  const presentValue = (amounts: DecimalString[], field: string) =>
    amounts.reduce(
      (sum, a, i) => sum.plus(nonNegative(a, `${field}[${i}]`).div(factors[i] ?? ONE)),
      ZERO,
    );
  const benefits = presentValue(series.benefits, 'benefits');
  const costs = presentValue(series.costs, 'costs');
  const defaultsUsed: DefaultUsed[] =
    options.reference === undefined
      ? [{ key: 'discounting.referenceDate', value: DEFAULT_DISCOUNT_REFERENCE }]
      : [];
  if (!costs.gt(0)) return result(undefined, [{ code: 'bcr.noCosts' }], defaultsUsed);
  return result(
    {
      ratio: toDecimalString(benefits.div(costs)),
      presentValueOfBenefits: toDecimalString(benefits),
      presentValueOfCosts: toDecimalString(costs),
    },
    [],
    defaultsUsed,
  );
}

// ---------------------------------------------------------------------------------------------
// Break-even

export interface BreakEvenProductSales {
  key: string;
  /** Planned quantity sold in the period. */
  salesVolume: DecimalString;
  /** Planned sales revenue of the product in the period. */
  salesRevenue: DecimalString;
}

export interface BreakEvenInput {
  /** Sales revenue of the period (all products). */
  salesRevenue: DecimalString;
  /** Variable costs of products sold (adjusted for finished-goods stock). */
  variableCosts: DecimalString;
  /** Fixed costs of products sold, excluding interest. */
  fixedCosts: DecimalString;
  /** Interest (costs of finance) of the period. */
  financialCosts: DecimalString;
  /**
   * Optional planned sales per product. Break-even then holds the planned mix constant, so each
   * product breaks even at the same share of its planned sales. Revenues must add up to
   * `salesRevenue`.
   */
  products?: BreakEvenProductSales[];
}

export interface BreakEvenProductPoint {
  key: string;
  salesVolume: DecimalString;
  salesValue: DecimalString;
}

export interface BreakEvenPoint {
  /** Fixed costs the margin must cover (with or without interest). */
  fixedCosts: DecimalString;
  breakEvenSalesValue?: DecimalString;
  /** Break-even sales value over planned sales revenue (share of planned sales). */
  breakEvenRatio?: DecimalString;
  /** Variable margin over fixed costs. */
  fixedCostCoverageRatio?: DecimalString;
  products?: BreakEvenProductPoint[];
}

export interface BreakEvenValue {
  variableMargin: DecimalString;
  variableMarginRatio?: DecimalString;
  includingFinance: BreakEvenPoint;
  excludingFinance: BreakEvenPoint;
}

/**
 * Break-even for one production period, all products (COMFAR X.C.6): variable margin ratio
 * `VMR = (S − VC) / S`; break-even sales value `= fixed costs / VMR`, with and without interest;
 * break-even ratio `= BE value / S`; fixed-cost coverage `= (S − VC) / fixed costs`.
 */
export function breakEven(input: BreakEvenInput): CalculationResult<BreakEvenValue> {
  const sales = nonNegative(input.salesRevenue, 'salesRevenue');
  const variable = nonNegative(input.variableCosts, 'variableCosts');
  const fixed = nonNegative(input.fixedCosts, 'fixedCosts');
  const finance = nonNegative(input.financialCosts, 'financialCosts');
  const products = input.products?.map((p, i) => ({
    key: p.key,
    volume: nonNegative(p.salesVolume, `products[${i}].salesVolume`),
    revenue: nonNegative(p.salesRevenue, `products[${i}].salesRevenue`),
  }));
  if (products !== undefined) {
    const total = products.reduce((sum, p) => sum.plus(p.revenue), ZERO);
    if (!total.eq(sales)) {
      throw new EngineInputError('breakEven.productRevenueMismatch', 'products', {
        expected: toDecimalString(sales),
        actual: toDecimalString(total),
      });
    }
  }

  const margin = sales.minus(variable);
  const warnings: CalculationWarning[] = [];
  const marginRatio = sales.gt(0) ? margin.div(sales) : undefined;
  if (marginRatio === undefined) warnings.push({ code: 'breakEven.noSales' });
  else if (!marginRatio.gt(0)) warnings.push({ code: 'breakEven.nonPositiveMargin' });

  const point = (costs: Decimal, variant: string): BreakEvenPoint => {
    const out: BreakEvenPoint = { fixedCosts: toDecimalString(costs) };
    if (costs.gt(0)) out.fixedCostCoverageRatio = toDecimalString(margin.div(costs));
    else warnings.push({ code: 'breakEven.noFixedCosts', params: { variant } });
    if (marginRatio === undefined || !marginRatio.gt(0)) return out;
    const value = costs.div(marginRatio);
    const ratio = value.div(sales);
    out.breakEvenSalesValue = toDecimalString(value);
    out.breakEvenRatio = toDecimalString(ratio);
    if (products !== undefined) {
      out.products = products.map((p) => ({
        key: p.key,
        salesVolume: toDecimalString(p.volume.times(ratio)),
        salesValue: toDecimalString(p.revenue.times(ratio)),
      }));
    }
    return out;
  };

  const value: BreakEvenValue = {
    variableMargin: toDecimalString(margin),
    includingFinance: point(fixed.plus(finance), 'includingFinance'),
    excludingFinance: point(fixed, 'excludingFinance'),
  };
  if (marginRatio !== undefined) value.variableMarginRatio = toDecimalString(marginRatio);
  return result(value, warnings);
}

export interface ProductBreakEvenInput {
  salesRevenue: DecimalString;
  salesVolume: DecimalString;
  /** Variable costs of the product, indirect costs allocated (COMFAR XI.G). */
  variableCosts: DecimalString;
  /** Fixed costs the product must cover; COMFAR uses fixed costs excluding interest. */
  fixedCosts: DecimalString;
}

export interface ProductBreakEvenValue {
  averageUnitPrice?: DecimalString;
  variableMargin: DecimalString;
  variableMarginRatio?: DecimalString;
  fixedCostCoverageRatio?: DecimalString;
  /** Constant price (average unit price): the volume at which the product breaks even. */
  constantPrice: {
    breakEvenSalesValue?: DecimalString;
    breakEvenSalesVolume?: DecimalString;
    /** Break-even volume over planned volume. */
    breakEvenRatio?: DecimalString;
  };
  /** Constant (planned) volume: the price at which the product breaks even. */
  constantVolume: {
    breakEvenSalesPrice?: DecimalString;
    breakEvenSalesValue?: DecimalString;
    /** Break-even price over average unit price. */
    breakEvenRatio?: DecimalString;
  };
}

/** Break-even of one product (COMFAR X.C.6, break-even analysis of each product). */
export function productBreakEven(
  input: ProductBreakEvenInput,
): CalculationResult<ProductBreakEvenValue> {
  const sales = nonNegative(input.salesRevenue, 'salesRevenue');
  const volume = nonNegative(input.salesVolume, 'salesVolume');
  const variable = nonNegative(input.variableCosts, 'variableCosts');
  const fixed = nonNegative(input.fixedCosts, 'fixedCosts');
  const warnings: CalculationWarning[] = [];
  const margin = sales.minus(variable);
  const price = volume.gt(0) ? sales.div(volume) : undefined;
  const marginRatio = sales.gt(0) ? margin.div(sales) : undefined;
  if (volume.isZero()) warnings.push({ code: 'breakEven.noVolume' });
  if (marginRatio === undefined) warnings.push({ code: 'breakEven.noSales' });
  else if (!marginRatio.gt(0)) warnings.push({ code: 'breakEven.nonPositiveMargin' });

  const value: ProductBreakEvenValue = {
    variableMargin: toDecimalString(margin),
    constantPrice: {},
    constantVolume: {},
  };
  if (price !== undefined) value.averageUnitPrice = toDecimalString(price);
  if (marginRatio !== undefined) value.variableMarginRatio = toDecimalString(marginRatio);
  if (fixed.gt(0)) value.fixedCostCoverageRatio = toDecimalString(margin.div(fixed));
  else warnings.push({ code: 'breakEven.noFixedCosts', params: { variant: 'product' } });

  if (marginRatio !== undefined && marginRatio.gt(0)) {
    const beValue = fixed.div(marginRatio);
    value.constantPrice.breakEvenSalesValue = toDecimalString(beValue);
    if (price !== undefined) {
      const beVolume = beValue.div(price);
      value.constantPrice.breakEvenSalesVolume = toDecimalString(beVolume);
      value.constantPrice.breakEvenRatio = toDecimalString(beVolume.div(volume));
    }
  }
  if (price !== undefined) {
    const bePrice = fixed.plus(variable).div(volume);
    value.constantVolume.breakEvenSalesPrice = toDecimalString(bePrice);
    value.constantVolume.breakEvenSalesValue = toDecimalString(fixed.plus(variable));
    if (price.gt(0)) value.constantVolume.breakEvenRatio = toDecimalString(bePrice.div(price));
  }
  return result(value, warnings);
}

// ---------------------------------------------------------------------------------------------
// Debt service: DSCR (COMFAR) and LLCR

export interface DebtServicePeriod {
  /** Surplus (deficit) of the cash flow for financial planning. */
  cashSurplus: DecimalString;
  /** Repayment of long-term loans. */
  repayment: DecimalString;
  /** Interest paid on long-term loans (not capitalised interest). */
  interest: DecimalString;
  /** Other financial costs of long-term loans (fees). */
  otherFinancialCosts: DecimalString;
}

export interface DebtServiceCoverage {
  /** `CF_j` = surplus + debt service: cash available for debt service. */
  cashAvailable: DecimalString;
  /** `DS_j` = repayment + interest + other financial costs. */
  debtService: DecimalString;
  /** `CF_j / DS_j`; absent in periods without debt service. */
  ratio?: DecimalString;
}

export interface DebtServiceCoverageValue {
  periods: DebtServiceCoverage[];
  /** Lowest ratio over the periods with debt service, and where it occurs (index from 0). */
  minimum?: { period: number; ratio: DecimalString };
}

/** Long-term debt-service coverage per period (COMFAR X.C.7): `CF_j / DS_j`. */
export function debtServiceCoverage(
  periods: DebtServicePeriod[],
): CalculationResult<DebtServiceCoverageValue> {
  if (periods.length === 0) throw new EngineInputError('series.empty', 'periods');
  let minimum: { period: number; ratio: Decimal } | undefined;
  const rows = periods.map((p, i): DebtServiceCoverage => {
    const service = nonNegative(p.repayment, `periods[${i}].repayment`)
      .plus(nonNegative(p.interest, `periods[${i}].interest`))
      .plus(nonNegative(p.otherFinancialCosts, `periods[${i}].otherFinancialCosts`));
    const available = toDecimal(p.cashSurplus).plus(service);
    const row: DebtServiceCoverage = {
      cashAvailable: toDecimalString(available),
      debtService: toDecimalString(service),
    };
    if (service.gt(0)) {
      const ratio = available.div(service);
      row.ratio = toDecimalString(ratio);
      if (minimum === undefined || ratio.lt(minimum.ratio)) minimum = { period: i, ratio };
    }
    return row;
  });
  const value: DebtServiceCoverageValue = { periods: rows };
  if (minimum === undefined) return result(value, [{ code: 'dscr.noDebtService' }]);
  value.minimum = { period: minimum.period, ratio: toDecimalString(minimum.ratio) };
  return result(value);
}

export interface LoanLifeInput {
  periodMonths: number[];
  /** Cash available for debt service per period (`CF_j` of `debtServiceCoverage`), at period end. */
  cashAvailable: DecimalString[];
  /** Long-term debt outstanding at the start of each period. */
  openingDebt: DecimalString[];
  /** Annual rate (or path) for discounting, usually the loans' interest rate; required. */
  annualRate: DecimalString | DecimalString[];
}

/**
 * Loan life coverage ratio (project-finance practice; not a COMFAR output): for every period with
 * debt outstanding, the present value at the period's start of the cash available for debt
 * service up to the last period with debt outstanding, over the opening debt.
 */
export function loanLifeCoverage(
  input: LoanLifeInput,
): CalculationResult<(DecimalString | undefined)[]> {
  sameLength(input.cashAvailable, input.periodMonths.length, 'cashAvailable');
  assertTimedSeries({ periodMonths: input.periodMonths, amounts: input.cashAvailable });
  sameLength(input.openingDebt, input.periodMonths.length, 'openingDebt');
  const debt = input.openingDebt.map((d, i) => nonNegative(d, `openingDebt[${i}]`));
  const cash = input.cashAvailable.map((c) => toDecimal(c));
  const factors = periodDiscountFactors(input.periodMonths, {
    annualRate: input.annualRate,
    reference: 'START_OF_FIRST_PERIOD',
  });
  let last = -1;
  debt.forEach((d, i) => {
    if (d.gt(0)) last = i;
  });
  if (last < 0)
    return result(
      debt.map(() => undefined),
      [{ code: 'llcr.noDebt' }],
    );
  const ratios = debt.map((d, t) => {
    if (!d.gt(0)) return undefined;
    const atStart = t === 0 ? ONE : (factors[t - 1] ?? ONE);
    let present = ZERO;
    for (let k = t; k <= last; k++) {
      present = present.plus((cash[k] ?? ZERO).times(atStart).div(factors[k] ?? ONE));
    }
    return toDecimalString(present.div(d));
  });
  return result(ratios);
}

// ---------------------------------------------------------------------------------------------
// WACC

export interface CapitalSource {
  kind: 'equity' | 'debt';
  /** Amount of the source (any currency, the same for all sources). */
  amount: DecimalString;
  /** Annual cost of the source, e.g. the required return on equity or a loan's interest rate. */
  cost: DecimalString;
}

/**
 * Weighted average cost of capital: `Σ w_i × k_i`, with debt costs after tax `k × (1 − t)`. A
 * helper for choosing a discount rate (COMFAR VII mentions the weighted average return); it is
 * never applied automatically.
 */
export function wacc(input: {
  sources: CapitalSource[];
  taxRate: DecimalString;
}): CalculationResult<DecimalString> {
  const tax = toDecimal(input.taxRate);
  if (tax.isNegative() || tax.gte(1))
    throw new EngineInputError('rate.notInUnitInterval', 'taxRate');
  if (input.sources.length === 0) throw new EngineInputError('series.empty', 'sources');
  let total = ZERO;
  let weighted = ZERO;
  input.sources.forEach((source, i) => {
    const amount = nonNegative(source.amount, `sources[${i}].amount`);
    const cost = toDecimal(source.cost);
    if (cost.lte(-1)) throw new EngineInputError('rate.notAboveMinus100', `sources[${i}].cost`);
    const afterTax = source.kind === 'debt' ? cost.times(ONE.minus(tax)) : cost;
    total = total.plus(amount);
    weighted = weighted.plus(amount.times(afterTax));
  });
  if (!total.gt(0)) throw new EngineInputError('wacc.noCapital', 'sources');
  return result(toDecimalString(weighted.div(total)));
}
