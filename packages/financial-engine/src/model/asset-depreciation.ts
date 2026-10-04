import { ZERO, toDecimal, toDecimalString, type Decimal, type DecimalString } from '../decimal';
import { depreciationSchedule, type DepreciationMethod } from '../depreciation';
import { EngineInputError } from '../errors';
import type { PlanningHorizon } from './horizon';

/**
 * Depreciation of assets acquired period by period, booked in project periods (manual VII.N,
 * VII.R; comfar-model-spec §4.4.2). Shared by fixed investment, pre-production expenditures and
 * the capitalised interest of loans.
 *
 * - Depreciation starts on the first day of a production period chosen by the user (`startPeriod`).
 * - Everything acquired before that day, and the starting balance of an existing enterprise (its
 *   effective date is the first day of the project, VII.N), is depreciated jointly from it; the
 *   first depreciation year runs to the next balance date (partial when the start is not right
 *   after one).
 * - Every later acquisition starts at the beginning of the financial year after the year in which
 *   it was acquired, with a full first year.
 * - Depreciation of a year is charged at its balance date, i.e. in the period that contains it;
 *   years after the end of production are not charged (the book value returns as residual value).
 */

export interface AssetDepreciation {
  method: DepreciationMethod;
  /** Length of depreciation in months (years × 12 + months). */
  lifeMonths: number;
  /** Salvage value as a fraction of the value depreciated, 0 ≤ SVR < 1. */
  salvageRate: DecimalString;
  /** Declining balance only: annual rate, 0 < DR ≤ 1. */
  decliningRate?: DecimalString;
  /** Index of the production period on whose first day depreciation starts. */
  startPeriod: number;
}

export interface AssetBookValues {
  /** Depreciation charged in each period. */
  depreciation: DecimalString[];
  /** Book value at the end of each period: starting balance and acquisitions so far less depreciation so far. */
  bookValue: DecimalString[];
}

function balanceYearAt(horizon: PlanningHorizon, month: number): number {
  // The financial year whose balance date is the first one on or after `month`.
  return horizon.balanceYears.findIndex((y) => y.endMonth >= month);
}

/**
 * Depreciation and book value per period of an asset whose acquisitions `amounts` (local currency,
 * one per period, flows on the period's last day) are given. Without `conditions` the asset is not
 * depreciated (e.g. land): its book value is what was acquired. `opening` is the book value of an
 * existing asset on the day before the first period.
 */
export function depreciateAcquisitions(
  horizon: PlanningHorizon,
  amounts: Decimal[],
  conditions: AssetDepreciation | undefined,
  field: string,
  opening: Decimal = ZERO,
): AssetBookValues {
  const periods = horizon.periods;
  const charge = periods.map(() => ZERO);
  if (conditions !== undefined) {
    const start = conditions.startPeriod;
    const startAt = periods[start];
    if (!Number.isInteger(start) || startAt === undefined || startAt.phase === 'CONSTRUCTION') {
      throw new EngineInputError('investment.depreciationStart', `${field}.startPeriod`);
    }
    // Batches: everything before the start together, then each later acquisition on its own.
    const batches: { value: Decimal; year: number; firstYearMonths: number }[] = [];
    const startYear = balanceYearAt(horizon, startAt.startMonth + 1);
    const joint = amounts.slice(0, start).reduce((sum, a) => sum.plus(a), opening);
    const startBalance = horizon.balanceYears[startYear];
    if (startBalance !== undefined && !joint.isZero()) {
      batches.push({
        value: joint,
        year: startYear,
        firstYearMonths: startBalance.endMonth - startAt.startMonth,
      });
    }
    for (let j = start; j < periods.length; j++) {
      const p = periods[j];
      const value = amounts[j] ?? ZERO;
      if (p === undefined || value.isZero()) continue;
      batches.push({
        value,
        year: balanceYearAt(horizon, p.startMonth + p.months) + 1,
        firstYearMonths: 12,
      });
    }
    const scheduleOf = (value: Decimal, firstYearMonths: number) =>
      withField(field, () =>
        depreciationSchedule({
          method: conditions.method,
          initialBookValue: toDecimalString(value),
          lifeMonths: conditions.lifeMonths,
          salvageRate: conditions.salvageRate,
          firstYearMonths,
          ...(conditions.decliningRate === undefined
            ? {}
            : { decliningRate: conditions.decliningRate }),
        }),
      ).value;
    // The conditions are checked even when nothing is acquired or charged within the horizon.
    scheduleOf(ZERO, 12);
    for (const batch of batches) {
      if (batch.year >= horizon.balanceYears.length) continue;
      const schedule = scheduleOf(batch.value, batch.firstYearMonths);
      for (const y of schedule.years) {
        const balance = horizon.balanceYears[batch.year + y.year];
        if (balance === undefined) break;
        charge[balance.period] = (charge[balance.period] ?? ZERO).plus(y.depreciation);
      }
    }
  }
  let acquired = opening;
  let charged = ZERO;
  const bookValue = periods.map((_, j) => {
    acquired = acquired.plus(amounts[j] ?? ZERO);
    charged = charged.plus(charge[j] ?? ZERO);
    return toDecimalString(acquired.minus(charged));
  });
  return { depreciation: charge.map((v) => toDecimalString(v)), bookValue };
}

/** Runs `fn`, prefixing the field of an input error with `field` (e.g. `items[2].depreciation`). */
export function withField<T>(field: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof EngineInputError) {
      throw new EngineInputError(error.code, `${field}.${error.field}`, error.params);
    }
    throw error;
  }
}

/** Parses one amount per period, refusing negative values and a wrong length. */
export function periodAmounts(values: DecimalString[], length: number, field: string): Decimal[] {
  if (values.length !== length) {
    throw new EngineInputError('series.lengthMismatch', field, {
      expected: String(length),
      actual: String(values.length),
    });
  }
  return values.map((v, j) => {
    const parsed = toDecimal(v);
    if (parsed.isNegative() && !parsed.isZero()) {
      throw new EngineInputError('amount.negative', `${field}[${j}]`);
    }
    return parsed;
  });
}
