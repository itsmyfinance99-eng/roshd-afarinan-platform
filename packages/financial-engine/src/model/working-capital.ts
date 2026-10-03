import { ZERO, toDecimal, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';

/**
 * Working-capital items by value (manual XI.K, total value algorithm; comfar-model-spec §4.7).
 * The requirement of a period is its basis divided by the coefficient of turnover
 * `c = 30 × m / Mdc`; stock bought in the construction phase is consumed first.
 *
 * The manual prints one recursion for every item (`X = WCV − B`, `WCV = max(X, RV)`). For a stock
 * it means "what is left after this period's consumption"; for receivables, payables, work in
 * progress and cash it would keep a balance for ever once its basis falls (e.g. receivables that
 * are never collected after sales stop). The engine therefore carries a value over only for
 * stocks; the other items equal their requirement (spec §4.7, OQ-39).
 */

/**
 * Days of coverage (COMFAR's Mdc), or the same as a share of the yearly basis (`days / 360`).
 * Required per item; 0 is an explicit "none".
 */
export type Coverage = { days: DecimalString } | { shareOfYear: DecimalString };

/** Days of coverage of an entered coverage. */
export function coverageDays(coverage: Coverage | undefined, field: string): Decimal {
  if (coverage === undefined) throw new EngineInputError('operations.coverageRequired', field);
  const days = 'days' in coverage ? coverage.days : undefined;
  const share = 'shareOfYear' in coverage ? coverage.shareOfYear : undefined;
  if ((days === undefined) === (share === undefined)) {
    throw new EngineInputError('operations.coverage', field);
  }
  const value = days === undefined ? toDecimal(share ?? '0').times(360) : toDecimal(days);
  if (value.isNegative() && !value.isZero()) {
    throw new EngineInputError(
      'amount.negative',
      `${field}.${days === undefined ? 'shareOfYear' : 'days'}`,
    );
  }
  return value;
}

export interface WorkingCapitalItemInput {
  /** `B_j`: basis per period (0 in construction periods). */
  bases: Decimal[];
  /** Months and phase of each period. */
  periods: { months: number; production: boolean }[];
  days: Decimal;
  /** Initial stock bought per construction period (materials only). */
  purchases?: Decimal[];
  /** A stock: what is left of the previous value is kept when it is above the requirement. */
  stock: boolean;
}

/**
 * Value of an item at the end of each period: in construction the stock bought so far; in
 * production `RV_j = B_j / c_j`, and for a stock `X_j = WCV_{j−1} − B_j`, `WCV_j = max(X_j, RV_j)`.
 */
export function workingCapitalValues(input: WorkingCapitalItemInput): Decimal[] {
  let value = ZERO;
  return input.periods.map((p, j) => {
    const basis = input.bases[j] ?? ZERO;
    if (p.production) {
      const required = basis.times(input.days).div(30 * p.months);
      const left = value.minus(basis);
      value = input.stock && left.gt(required) ? left : required;
    } else {
      value = value.plus(input.purchases?.[j] ?? ZERO);
    }
    return value;
  });
}
