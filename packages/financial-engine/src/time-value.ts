import { Decimal, ONE, ZERO, toDecimal, toDecimalString, type DecimalString } from './decimal';
import { EngineInputError } from './errors';
import { MODEL_VERSION } from './version';
import type { CalculationResult, DefaultUsed } from './types';

/**
 * Time value of money with COMFAR conventions (comfar-model-spec §1, §4.1; manual XI.D–E):
 * 360-day year, flows on the last day of their period, factor `(1 + d)^(m/12)` for `m` months
 * between the reference date and the flow, rates as decimal fractions ("0.12" = 12 % p.a.).
 */

/** Where present values are measured. COMFAR's default is the end of the first year. */
export type DiscountReference = 'START_OF_FIRST_PERIOD' | 'END_OF_FIRST_YEAR';

export const DEFAULT_DISCOUNT_REFERENCE: DiscountReference = 'END_OF_FIRST_YEAR';

const MONTHS_PER_YEAR = new Decimal(12);

/** A rate of −100 % or less has no meaning for discounting or compounding. */
function assertRate(rate: Decimal, field: string): void {
  if (rate.lte(-1)) throw new EngineInputError('rate.notAboveMinus100', field);
}

function assertMonths(months: number, field: string): void {
  if (!Number.isInteger(months) || months <= 0) {
    throw new EngineInputError('period.lengthNotPositiveInteger', field);
  }
}

/** `(1 + annualRate)^(months/12)`; `months` may be negative (compounding) or fractional. */
export function discountFactor(annualRate: DecimalString, months: DecimalString): DecimalString {
  const rate = toDecimal(annualRate);
  assertRate(rate, 'annualRate');
  return toDecimalString(ONE.plus(rate).pow(toDecimal(months).div(MONTHS_PER_YEAR)));
}

/** Rate for a period of `months` that compounds to `annualRate` over a year. */
export function periodRateFromAnnual(annualRate: DecimalString, months: number): DecimalString {
  const rate = toDecimal(annualRate);
  assertRate(rate, 'annualRate');
  assertMonths(months, 'months');
  return toDecimalString(ONE.plus(rate).pow(new Decimal(months).div(MONTHS_PER_YEAR)).minus(ONE));
}

/** Annual rate equivalent to `periodRate` charged every `months` months. */
export function annualRateFromPeriod(periodRate: DecimalString, months: number): DecimalString {
  const rate = toDecimal(periodRate);
  assertRate(rate, 'periodRate');
  assertMonths(months, 'months');
  return toDecimalString(ONE.plus(rate).pow(MONTHS_PER_YEAR.div(months)).minus(ONE));
}

/** Fisher relation: `(1 + nominal) = (1 + real) × (1 + inflation)`. */
export function nominalFromReal(realRate: DecimalString, inflation: DecimalString): DecimalString {
  const real = toDecimal(realRate);
  const infl = toDecimal(inflation);
  assertRate(real, 'realRate');
  assertRate(infl, 'inflation');
  return toDecimalString(ONE.plus(real).times(ONE.plus(infl)).minus(ONE));
}

/** Inverse of {@link nominalFromReal}. */
export function realFromNominal(
  nominalRate: DecimalString,
  inflation: DecimalString,
): DecimalString {
  const nominal = toDecimal(nominalRate);
  const infl = toDecimal(inflation);
  assertRate(nominal, 'nominalRate');
  assertRate(infl, 'inflation');
  return toDecimalString(ONE.plus(nominal).div(ONE.plus(infl)).minus(ONE));
}

export interface TimedSeries {
  /** Length of each period in months, e.g. a construction phase of quarters then years. */
  periodMonths: number[];
  /** Net amount of each period, paid on the period's last day. Same length as `periodMonths`. */
  amounts: DecimalString[];
}

export interface DiscountingOptions {
  /**
   * Annual discount rate: one rate for the whole horizon, or one per period (a rate path).
   * Required — there is no economic default (ADR-0009).
   */
  annualRate: DecimalString | DecimalString[];
  /** Defaults to COMFAR's end of first year (owner decision); reported in `defaultsUsed`. */
  reference?: DiscountReference;
  /** Residual (salvage) value received at the end of the last period. */
  salvageValue?: DecimalString;
}

function ratePerPeriod(annualRate: DecimalString | DecimalString[], periods: number): Decimal[] {
  if (typeof annualRate === 'string') {
    const rate = toDecimal(annualRate);
    assertRate(rate, 'annualRate');
    return Array.from({ length: periods }, () => rate);
  }
  if (annualRate.length !== periods) {
    throw new EngineInputError('rate.pathLengthMismatch', 'annualRate', {
      expected: String(periods),
      actual: String(annualRate.length),
    });
  }
  return annualRate.map((r, i) => {
    const rate = toDecimal(r);
    assertRate(rate, `annualRate[${i}]`);
    return rate;
  });
}

/**
 * Discount factors for the end of every period, relative to the reference date. With a rate path
 * the factor accumulates period by period: `F(end_j) = Π (1 + d_k)^(len_k/12)`; a reference at
 * month 12 divides by `F(12)`, so flows before it are compounded forward (COMFAR XI.D).
 */
export function periodDiscountFactors(
  periodMonths: number[],
  options: Pick<DiscountingOptions, 'annualRate' | 'reference'>,
): Decimal[] {
  periodMonths.forEach((m, i) => assertMonths(m, `periodMonths[${i}]`));
  const rates = ratePerPeriod(options.annualRate, periodMonths.length);
  const cumulative: Decimal[] = [];
  let factor = ONE;
  periodMonths.forEach((months, i) => {
    factor = factor.times(ONE.plus(rates[i] ?? ZERO).pow(new Decimal(months).div(MONTHS_PER_YEAR)));
    cumulative.push(factor);
  });
  const reference = options.reference ?? DEFAULT_DISCOUNT_REFERENCE;
  if (reference === 'START_OF_FIRST_PERIOD') return cumulative;
  const atReference = factorAtMonth(periodMonths, rates, 12);
  return cumulative.map((f) => f.div(atReference));
}

/** Cumulative factor at an arbitrary month, walking the (possibly uneven) periods. */
function factorAtMonth(periodMonths: number[], rates: Decimal[], month: number): Decimal {
  let factor = ONE;
  let elapsed = 0;
  for (let i = 0; i < periodMonths.length && elapsed < month; i++) {
    const months = periodMonths[i] ?? 0;
    const used = minInt(months, month - elapsed);
    factor = factor.times(ONE.plus(rates[i] ?? ZERO).pow(new Decimal(used).div(MONTHS_PER_YEAR)));
    elapsed += used;
  }
  if (elapsed < month) {
    // Horizon shorter than the reference point: extend with the last rate.
    const last = rates[rates.length - 1] ?? ZERO;
    factor = factor.times(ONE.plus(last).pow(new Decimal(month - elapsed).div(MONTHS_PER_YEAR)));
  }
  return factor;
}

/** Integer minimum (the package bans `Math` to keep floating point out). */
function minInt(a: number, b: number): number {
  return a < b ? a : b;
}

/**
 * Net present value (COMFAR XI.E): `Σ A_j / F_j + SV / F_n`. The result lists the reference date in
 * `defaultsUsed` when the caller left COMFAR's default in place.
 */
export function npv(
  series: TimedSeries,
  options: DiscountingOptions,
): CalculationResult<DecimalString> {
  if (series.amounts.length !== series.periodMonths.length) {
    throw new EngineInputError('series.lengthMismatch', 'amounts', {
      expected: String(series.periodMonths.length),
      actual: String(series.amounts.length),
    });
  }
  if (series.amounts.length === 0) throw new EngineInputError('series.empty', 'amounts');
  const factors = periodDiscountFactors(series.periodMonths, options);
  let total = ZERO;
  series.amounts.forEach((amount, i) => {
    total = total.plus(toDecimal(amount).div(factors[i] ?? ONE));
  });
  if (options.salvageValue !== undefined) {
    total = total.plus(toDecimal(options.salvageValue).div(factors[factors.length - 1] ?? ONE));
  }
  const defaultsUsed: DefaultUsed[] =
    options.reference === undefined
      ? [{ key: 'discounting.referenceDate', value: DEFAULT_DISCOUNT_REFERENCE }]
      : [];
  return { value: toDecimalString(total), modelVersion: MODEL_VERSION, warnings: [], defaultsUsed };
}

/** Present value of one amount `months` after the reference date. */
export function presentValue(
  amount: DecimalString,
  annualRate: DecimalString,
  months: DecimalString,
): DecimalString {
  return toDecimalString(toDecimal(amount).div(toDecimal(discountFactor(annualRate, months))));
}

/** Future value of one amount compounded for `months`. */
export function futureValue(
  amount: DecimalString,
  annualRate: DecimalString,
  months: DecimalString,
): DecimalString {
  return toDecimalString(toDecimal(amount).times(toDecimal(discountFactor(annualRate, months))));
}
