import { Decimal, ONE, ZERO, toDecimal, toDecimalString, type DecimalString } from './decimal';
import { EngineInputError } from './errors';
import {
  DEFAULT_DISCOUNT_REFERENCE,
  assertTimedSeries,
  type DiscountReference,
  type TimedSeries,
} from './time-value';
import type { CalculationResult, CalculationWarning, DefaultUsed } from './types';
import { MODEL_VERSION } from './version';

/**
 * IRR and MIRR (comfar-model-spec §4.1; manual XI.E). Rates are annual decimal fractions, like the
 * discount rate in `npv`, and the timing follows the same COMFAR conventions (flows at period end,
 * factor `(1 + r)^(m/12)`).
 *
 * IRR: the series is scanned over a wide rate grid for sign changes of NPV and every bracket is
 * narrowed by bisection, which cannot diverge. The engine never picks one of several roots: with no
 * root or several roots the value is `undefined` and a warning lists what was found.
 */

const MONTHS_PER_YEAR = new Decimal(12);
/** Search range for IRR: −99 % … +1 000 % a year, in steps of 0.025 in ln(1 + r). */
const GRID_LOW = new Decimal('0.01').ln(); // r = −99 %
const GRID_HIGH = new Decimal(11).ln(); // r = +1 000 %
const GRID_STEP = new Decimal('0.025');
/** Bisection stops when the bracket is narrower than this (in rate units). */
const RATE_TOLERANCE = new Decimal('1e-20');
const RESULT_SCALE = 15;

interface PreparedSeries {
  months: number[];
  amounts: Decimal[];
  salvage: Decimal;
}

function prepare(series: TimedSeries, salvageValue?: DecimalString): PreparedSeries {
  assertTimedSeries(series);
  return {
    months: series.periodMonths,
    amounts: series.amounts.map((a) => toDecimal(a)),
    salvage: salvageValue === undefined ? ZERO : toDecimal(salvageValue),
  };
}

/**
 * NPV at the start of the first period for one constant rate. Each distinct period length needs
 * one fractional power; the rest is multiplication, so the grid search stays fast.
 */
function npvAtStart(series: PreparedSeries, rate: Decimal): Decimal {
  const growth = new Map<number, Decimal>();
  const base = ONE.plus(rate);
  let factor = ONE;
  let total = ZERO;
  series.months.forEach((months, i) => {
    let g = growth.get(months);
    if (g === undefined) {
      g = base.pow(new Decimal(months).div(MONTHS_PER_YEAR));
      growth.set(months, g);
    }
    factor = factor.times(g);
    total = total.plus((series.amounts[i] ?? ZERO).div(factor));
  });
  return total.plus(series.salvage.div(factor));
}

/** Number of sign changes in the flows (zeros skipped): an upper bound on the number of IRRs. */
export function signChanges(amounts: DecimalString[]): number {
  let changes = 0;
  let previous = 0;
  for (const a of amounts) {
    const sign = toDecimal(a).cmp(0);
    if (sign === 0) continue;
    if (previous !== 0 && sign !== previous) changes++;
    previous = sign;
  }
  return changes;
}

function bisect(series: PreparedSeries, low: Decimal, high: Decimal, npvLow: Decimal): Decimal {
  let lo = low;
  let hi = high;
  let fLo = npvLow;
  for (let i = 0; i < 200 && hi.minus(lo).gt(RATE_TOLERANCE); i++) {
    const mid = lo.plus(hi).div(2);
    const fMid = npvAtStart(series, mid);
    if (fMid.isZero()) return mid;
    if (fMid.isNegative() === fLo.isNegative()) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return lo.plus(hi).div(2);
}

/** Every IRR found in the search range, ascending. */
function findRoots(series: PreparedSeries): Decimal[] {
  const roots: Decimal[] = [];
  let prevRate: Decimal | undefined;
  let prevNpv: Decimal | undefined;
  for (let x = GRID_LOW; x.lte(GRID_HIGH); x = x.plus(GRID_STEP)) {
    const rate = x.exp().minus(ONE);
    const value = npvAtStart(series, rate);
    if (value.isZero()) {
      roots.push(rate);
    } else if (prevRate !== undefined && prevNpv !== undefined && !prevNpv.isZero()) {
      if (value.isNegative() !== prevNpv.isNegative()) {
        roots.push(bisect(series, prevRate, rate, prevNpv));
      }
    }
    prevRate = rate;
    prevNpv = value;
  }
  return roots;
}

export interface IrrOptions {
  salvageValue?: DecimalString;
}

/**
 * Internal rate of return (annual). `undefined` with a warning when the flows never change sign,
 * when no root lies between −99 % and +1 000 %, or when several roots exist (all are listed).
 */
export function irr(
  series: TimedSeries,
  options: IrrOptions = {},
): CalculationResult<DecimalString | undefined> {
  const prepared = prepare(series, options.salvageValue);
  const flows =
    options.salvageValue === undefined ? series.amounts : [...series.amounts, options.salvageValue];
  const result = (value: DecimalString | undefined, warnings: CalculationWarning[]) => ({
    value,
    modelVersion: MODEL_VERSION,
    warnings,
    defaultsUsed: [],
  });
  if (signChanges(flows) === 0) return result(undefined, [{ code: 'irr.noSignChange' }]);
  const roots = findRoots(prepared).map((r) => toDecimalString(r, RESULT_SCALE));
  if (roots.length === 0) return result(undefined, [{ code: 'irr.notFound' }]);
  if (roots.length > 1) {
    return result(undefined, [
      { code: 'irr.multiple', params: { count: String(roots.length), roots: roots.join(' ') } },
    ]);
  }
  return result(roots[0], []);
}

export interface MirrOptions {
  /** Rate at which surpluses are reinvested. Defaults to the IRR (COMFAR), reported in `defaultsUsed`. */
  reinvestmentRate?: DecimalString;
  /** Rate at which deficits are financed. Defaults to the IRR (COMFAR), reported in `defaultsUsed`. */
  borrowingRate?: DecimalString;
  /** Where deficits are discounted to; defaults to COMFAR's end of first year. */
  reference?: DiscountReference;
  /** Residual value at the end of the horizon, counted as a surplus. */
  salvageValue?: DecimalString;
}

/**
 * Modified IRR as defined by COMFAR: surpluses compounded at the reinvestment rate to the end of
 * the horizon (`P`), deficits discounted at the borrowing rate to the reference date (`N`),
 * `MIRR = (P / N)^(12 / months) − 1` where `months` runs from the reference date to the horizon end.
 */
export function mirr(
  series: TimedSeries,
  options: MirrOptions = {},
): CalculationResult<DecimalString | undefined> {
  const prepared = prepare(series, options.salvageValue);
  const defaultsUsed: DefaultUsed[] = [];
  const warnings: CalculationWarning[] = [];
  const done = (value: DecimalString | undefined) => ({
    value,
    modelVersion: MODEL_VERSION,
    warnings,
    defaultsUsed,
  });

  let reinvest = options.reinvestmentRate;
  let borrow = options.borrowingRate;
  if (reinvest === undefined || borrow === undefined) {
    const internal = irr(
      series,
      options.salvageValue === undefined ? {} : { salvageValue: options.salvageValue },
    );
    if (internal.value === undefined) {
      warnings.push({ code: 'mirr.ratesRequired' }, ...internal.warnings);
      return done(undefined);
    }
    reinvest ??= internal.value;
    borrow ??= internal.value;
    defaultsUsed.push({ key: 'mirr.rates', value: internal.value });
  }
  const reinvestRate = toDecimal(reinvest);
  const borrowRate = toDecimal(borrow);
  if (reinvestRate.lte(-1)) throw new EngineInputError('rate.notAboveMinus100', 'reinvestmentRate');
  if (borrowRate.lte(-1)) throw new EngineInputError('rate.notAboveMinus100', 'borrowingRate');

  const reference = options.reference ?? DEFAULT_DISCOUNT_REFERENCE;
  if (options.reference === undefined) {
    defaultsUsed.push({ key: 'discounting.referenceDate', value: DEFAULT_DISCOUNT_REFERENCE });
  }
  const referenceMonth = reference === 'START_OF_FIRST_PERIOD' ? 0 : 12;
  const totalMonths = prepared.months.reduce((sum, m) => sum + m, 0);
  if (totalMonths <= referenceMonth) {
    throw new EngineInputError('mirr.horizonTooShort', 'periodMonths');
  }

  let surplusAtEnd = ZERO;
  let deficitAtReference = ZERO;
  let elapsed = 0;
  const add = (amount: Decimal, atMonth: number) => {
    if (amount.isPositive() && !amount.isZero()) {
      const months = new Decimal(totalMonths - atMonth).div(MONTHS_PER_YEAR);
      surplusAtEnd = surplusAtEnd.plus(amount.times(ONE.plus(reinvestRate).pow(months)));
    } else if (amount.isNegative()) {
      const months = new Decimal(atMonth - referenceMonth).div(MONTHS_PER_YEAR);
      deficitAtReference = deficitAtReference.plus(
        amount.neg().div(ONE.plus(borrowRate).pow(months)),
      );
    }
  };
  prepared.months.forEach((months, i) => {
    elapsed += months;
    add(prepared.amounts[i] ?? ZERO, elapsed);
  });
  add(prepared.salvage, totalMonths);

  if (deficitAtReference.isZero()) {
    warnings.push({ code: 'mirr.noDeficit' });
    return done(undefined);
  }
  const years = new Decimal(totalMonths - referenceMonth).div(MONTHS_PER_YEAR);
  const value = surplusAtEnd.div(deficitAtReference).pow(ONE.div(years)).minus(ONE);
  return done(toDecimalString(value, RESULT_SCALE));
}
