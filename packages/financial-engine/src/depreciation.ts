import { Decimal, ZERO, toDecimal, toDecimalString, type DecimalString } from './decimal';
import { EngineInputError } from './errors';
import type { CalculationResult } from './types';
import { MODEL_VERSION } from './version';

/**
 * Depreciation (comfar-model-spec §4.4; manual XI.H, VII.N): the four COMFAR methods with a
 * possibly partial first depreciation year. Rules the manual leaves open or prints inconsistently
 * are listed in the spec (§4.4.1) and pinned by tests.
 *
 * The schedule is per depreciation year (balance date to balance date). Which project period a
 * year belongs to, when depreciation starts and how assets bought in different periods are grouped
 * is decided by the model layer (ST-34.02).
 */

export type DepreciationMethod =
  'LINEAR_TO_ZERO' | 'LINEAR_TO_SCRAP' | 'DECLINING_BALANCE' | 'SUM_OF_YEARS_DIGITS';

export interface DepreciationInput {
  method: DepreciationMethod;
  /** IBV: value to depreciate, in local currency. */
  initialBookValue: DecimalString;
  /** L: length of depreciation in months (years × 12 + months). */
  lifeMonths: number;
  /** SVR: salvage (scrap) value as a fraction of IBV, 0 ≤ SVR < 1. */
  salvageRate: DecimalString;
  /** m1: months in the first depreciation year, 1 … 12 (12 = a full year). */
  firstYearMonths: number;
  /** DR: annual rate of the declining balance, 0 < DR ≤ 1; only for `DECLINING_BALANCE`. */
  decliningRate?: DecimalString;
}

export interface DepreciationYear {
  /** Depreciation year, from 0; year 0 has `firstYearMonths` months. */
  year: number;
  depreciation: DecimalString;
  /** RBV: remaining book value at the end of the year. */
  bookValue: DecimalString;
}

export interface DepreciationSchedule {
  /** SV = IBV × SVR: the book value the schedule ends at. */
  salvageValue: DecimalString;
  years: DepreciationYear[];
  /** For `DECLINING_BALANCE`: the first year depreciated linearly to scrap, if any. */
  switchedToLinearInYear?: number;
}

const TWELVE = new Decimal(12);

function validate(input: DepreciationInput): { ibv: Decimal; sv: Decimal } {
  const ibv = toDecimal(input.initialBookValue);
  if (ibv.isNegative() && !ibv.isZero()) {
    throw new EngineInputError('amount.negative', 'initialBookValue');
  }
  if (!Number.isInteger(input.lifeMonths) || input.lifeMonths <= 0) {
    throw new EngineInputError('period.lengthNotPositiveInteger', 'lifeMonths');
  }
  const m1 = input.firstYearMonths;
  if (!Number.isInteger(m1) || m1 < 1 || m1 > 12) {
    throw new EngineInputError('depreciation.firstYearMonths', 'firstYearMonths');
  }
  const svr = toDecimal(input.salvageRate);
  if (svr.isNegative() || svr.gte(1)) {
    throw new EngineInputError('rate.notInUnitInterval', 'salvageRate');
  }
  return { ibv, sv: ibv.times(svr) };
}

/**
 * Depreciation schedule of one asset. Each method yields the cumulative charge at the end of every
 * depreciation year; the last one is exactly IBV − SV, so rounding in the 34th digit can neither
 * leave a residue year nor push the book value below salvage (COMFAR `D_{M+1} = RBV_M − SV`).
 */
export function depreciationSchedule(
  input: DepreciationInput,
): CalculationResult<DepreciationSchedule> {
  const { ibv, sv } = validate(input);
  let rate: Decimal | undefined;
  if (input.method === 'DECLINING_BALANCE') {
    if (input.decliningRate === undefined) {
      throw new EngineInputError('depreciation.rateRequired', 'decliningRate');
    }
    rate = toDecimal(input.decliningRate);
    if (!rate.gt(0) || rate.gt(1)) {
      throw new EngineInputError('depreciation.rateOutOfRange', 'decliningRate');
    }
  }
  const schedule: DepreciationSchedule = { salvageValue: toDecimalString(sv), years: [] };
  if (ibv.lte(sv)) return done(schedule);

  const cap = ibv.minus(sv);
  const { lifeMonths, firstYearMonths: m1 } = input;
  const cumulative =
    input.method === 'SUM_OF_YEARS_DIGITS'
      ? sumOfYearsDigits(cap, lifeMonths, m1)
      : input.method === 'DECLINING_BALANCE'
        ? decliningBalance(ibv, cap, lifeMonths, m1, rate ?? ZERO, schedule)
        : linear(input.method === 'LINEAR_TO_ZERO' ? ibv : cap, cap, lifeMonths, m1);
  cumulative[cumulative.length - 1] = cap;
  let previous = ZERO;
  cumulative.forEach((charged, year) => {
    schedule.years.push({
      year,
      depreciation: toDecimalString(charged.minus(previous)),
      bookValue: toDecimalString(ibv.minus(charged)),
    });
    previous = charged;
  });
  return done(schedule);
}

function done(value: DepreciationSchedule): CalculationResult<DepreciationSchedule> {
  return { value, modelVersion: MODEL_VERSION, warnings: [], defaultsUsed: [] };
}

/**
 * Linear to zero (`base` = IBV) and linear to scrap (`base` = IBV − SV): `base / L` a year and `m1/12`
 * of it in the first year, until `cap` = IBV − SV is reached. After `c` months the cumulative charge
 * is `base × c / L`; the cap test `base × c ≥ cap × L` needs no division. Equivalent to the manual's
 * `M = integral part of …` with `D_{M+1} = RBV_M − SV`, and also defined when M < 1.
 */
function linear(base: Decimal, cap: Decimal, lifeMonths: number, m1: number): Decimal[] {
  const cumulative: Decimal[] = [];
  const capTimesLife = cap.times(lifeMonths);
  for (let months = m1; ; months += 12) {
    if (base.times(months).gte(capTimesLife)) {
      cumulative.push(cap);
      return cumulative;
    }
    cumulative.push(base.times(months).div(lifeMonths));
  }
}

/**
 * Declining balance switching to linear to scrap: year 1 `IBV × DR × m1/12`; from year 2 the
 * declining charge `RBV × DR` applies while it exceeds `(RBV − SV) / RL`, RL being the remaining
 * life at the start of the year (spec §4.4.1). From the first year it does not, the rest is spread
 * evenly over the remaining months; a life that ends earlier writes the rest off at once.
 */
function decliningBalance(
  ibv: Decimal,
  cap: Decimal,
  lifeMonths: number,
  m1: number,
  rate: Decimal,
  schedule: DepreciationSchedule,
): Decimal[] {
  const first = ibv.times(rate).times(m1).div(TWELVE);
  if (first.gte(cap)) return [cap];
  const cumulative: Decimal[] = [first];
  let charged = first;
  for (let year = 1; ; year++) {
    const remainingMonths = lifeMonths - m1 - 12 * (year - 1);
    const remaining = cap.minus(charged);
    if (remainingMonths <= 0) {
      schedule.switchedToLinearInYear = year;
      cumulative.push(cap);
      return cumulative;
    }
    const declining = ibv.minus(charged).times(rate);
    const straight = remaining.times(12).div(remainingMonths);
    if (!declining.gt(straight)) {
      schedule.switchedToLinearInYear = year;
      for (let months = 12; months < remainingMonths; months += 12) {
        cumulative.push(charged.plus(remaining.times(months).div(remainingMonths)));
      }
      cumulative.push(cap);
      return cumulative;
    }
    if (declining.gte(remaining)) {
      cumulative.push(cap);
      return cumulative;
    }
    charged = charged.plus(declining);
    cumulative.push(charged);
  }
}

/**
 * Sum of years digits. The manual first builds "intermediate" amounts per year of life — with
 * `m` extra months, a first stub of `m` months weighted by L, then Y full years on the rest — and
 * then shifts them onto depreciation years whose first one has `m1` months. We do the shift by
 * time: each depreciation year takes every life year's amount in proportion to the months they
 * share. This reproduces the manual's formulas where they are consistent and always depreciates
 * exactly IBV − SV (spec §4.4.1).
 */
function sumOfYearsDigits(base: Decimal, lifeMonths: number, m1: number): Decimal[] {
  const years = (lifeMonths - (lifeMonths % 12)) / 12;
  const extra = lifeMonths % 12;
  const segments: { start: number; end: number; amount: Decimal }[] = [];
  if (extra === 0) {
    const divisor = new Decimal(years * (years + 1)).div(2);
    for (let j = 1; j <= years; j++) {
      segments.push({
        start: 12 * (j - 1),
        end: 12 * j,
        amount: base.times(years - j + 1).div(divisor),
      });
    }
  } else if (years === 0) {
    segments.push({ start: 0, end: extra, amount: base });
  } else {
    const life = new Decimal(lifeMonths).div(TWELVE);
    const stubYears = new Decimal(extra).div(TWELVE);
    const sodl = new Decimal(years + 1).times(stubYears.times(2).plus(years)).div(2);
    const stub = life.div(sodl).times(stubYears).times(base);
    segments.push({ start: 0, end: extra, amount: stub });
    const adjusted = new Decimal(years * (years + 1)).div(2);
    const rest = base.minus(stub);
    for (let j = 2; j <= years + 1; j++) {
      const start = extra + 12 * (j - 2);
      segments.push({ start, end: start + 12, amount: rest.times(years - j + 2).div(adjusted) });
    }
  }

  const cumulative: Decimal[] = [];
  let charged = ZERO;
  for (let start = 0, end = m1; start < lifeMonths; start = end, end += 12) {
    for (const s of segments) {
      const from = s.start > start ? s.start : start;
      const to = s.end < end ? s.end : end;
      if (to > from) charged = charged.plus(s.amount.times(to - from).div(s.end - s.start));
    }
    cumulative.push(charged);
  }
  return cumulative;
}

export interface RevaluedYear {
  year: number;
  depreciation: DecimalString;
  bookValue: DecimalString;
  /**
   * Cumulative revaluation adjustment in net worth: revalued book value + revalued depreciation
   * charged so far − IBV, so the balance sheet still balances.
   */
  revaluationAdjustment: DecimalString;
}

/**
 * Revaluation with inflation (manual XI.B, fixed assets): `V_j = V_i × FI_j / FI_i`, depreciation on
 * the revalued value. `factors[k]` is `FI_j / FI_i` for depreciation year `k` (index of that year
 * over the index of the acquisition year); the caller aligns years with the inflation path.
 */
export function revaluedDepreciation(
  input: { initialBookValue: DecimalString; years: DepreciationYear[] },
  factors: DecimalString[],
): CalculationResult<RevaluedYear[]> {
  if (factors.length !== input.years.length) {
    throw new EngineInputError('series.lengthMismatch', 'factors', {
      expected: String(input.years.length),
      actual: String(factors.length),
    });
  }
  const ibv = toDecimal(input.initialBookValue);
  let charged = ZERO;
  const value = input.years.map((y, k): RevaluedYear => {
    const factor = toDecimal(factors[k] ?? '1');
    if (!factor.gt(0)) throw new EngineInputError('index.notPositive', `factors[${k}]`);
    const depreciation = toDecimal(y.depreciation).times(factor);
    const book = toDecimal(y.bookValue).times(factor);
    charged = charged.plus(depreciation);
    return {
      year: y.year,
      depreciation: toDecimalString(depreciation),
      bookValue: toDecimalString(book),
      revaluationAdjustment: toDecimalString(book.plus(charged).minus(ibv)),
    };
  });
  return { value, modelVersion: MODEL_VERSION, warnings: [], defaultsUsed: [] };
}
