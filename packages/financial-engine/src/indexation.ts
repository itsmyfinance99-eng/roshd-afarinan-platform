import { type Decimal, ONE, toDecimal, toDecimalString, type DecimalString } from './decimal';
import { EngineInputError } from './errors';
import type { EngineMessageCode } from './messages';
import type { CalculationResult } from './types';
import { MODEL_VERSION } from './version';

/**
 * Inflation, price escalation and exchange rates (comfar-model-spec §2; manual XI.A–C). All paths
 * are per year ending on a balance date; a partial first year carries the rate for that partial
 * year only (the user enters it, nothing is scaled). Every rate is user-entered; there are no
 * defaults. Mapping project periods to years is the model layer's job (ST-34).
 */

function done<T>(value: T): CalculationResult<T> {
  return { value, modelVersion: MODEL_VERSION, warnings: [], defaultsUsed: [] };
}

function nonEmpty(values: unknown[], field: string): void {
  if (values.length === 0) throw new EngineInputError('series.empty', field);
}

function sameLength(values: unknown[], expected: number, field: string): void {
  if (values.length !== expected) {
    throw new EngineInputError('series.lengthMismatch', field, {
      expected: String(expected),
      actual: String(values.length),
    });
  }
}

function rate(value: DecimalString, field: string): Decimal {
  const parsed = toDecimal(value);
  if (parsed.lte(-1)) throw new EngineInputError('rate.notAboveMinus100', field);
  return parsed;
}

function positive(value: DecimalString, code: EngineMessageCode, field: string): Decimal {
  const parsed = toDecimal(value);
  if (!parsed.gt(0)) throw new EngineInputError(code, field);
  return parsed;
}

export interface EscalationInput {
  /** `R_j`: inflation of the item's currency in each year. */
  inflation: DecimalString[];
  /**
   * `E_j`: escalation of the item relative to its currency's inflation, one rate for every year or
   * one per year. "0" is an explicit "no escalation" choice, never assumed.
   */
  escalation: DecimalString | DecimalString[];
  /** `e`: COMFAR's first-year escalator, a whole number ≥ 0 (0 = none). */
  firstYearEscalator: number;
}

/**
 * Current-price factors (manual XI.C): `P_Cj = P_Ej × F_j` with
 * `F_1 = 1 + R_1 + ((1 + E_1)^e − 1)` and `F_j = F_{j−1} × (1 + R_j + E_j)`. Inflation and
 * escalation add up inside each year's factor, as in COMFAR; they are not compounded with each
 * other. Year 1 is inflated: the entered price is the price at the start of the horizon and flows
 * fall at the end of the year (spec §2.1).
 */
export function priceEscalationFactors(input: EscalationInput): CalculationResult<DecimalString[]> {
  nonEmpty(input.inflation, 'inflation');
  const e = input.firstYearEscalator;
  if (!Number.isInteger(e) || e < 0) {
    throw new EngineInputError('index.escalatorNotInteger', 'firstYearEscalator');
  }
  const escalation =
    typeof input.escalation === 'string'
      ? input.inflation.map(() => input.escalation as DecimalString)
      : input.escalation;
  sameLength(escalation, input.inflation.length, 'escalation');
  let factor = ONE;
  const factors = input.inflation.map((r, j) => {
    const inflation = rate(r, `inflation[${j}]`);
    const esc = rate(escalation[j] ?? '0', `escalation[${j}]`);
    const yearly =
      j === 0
        ? ONE.plus(inflation).plus(ONE.plus(esc).pow(e).minus(ONE))
        : ONE.plus(inflation).plus(esc);
    if (!yearly.gt(0)) throw new EngineInputError('index.factorNotPositive', `escalation[${j}]`);
    factor = factor.times(yearly);
    return toDecimalString(factor);
  });
  return done(factors);
}

/**
 * Inflation index of the local currency (manual XI.B, revaluation of fixed assets):
 * `FI_1 = 1`, `FI_j = (1 + R_1) × … × (1 + R_{j−1})`. Asset values follow `V_j = V_i × FI_j / FI_i`.
 */
export function inflationIndex(inflation: DecimalString[]): CalculationResult<DecimalString[]> {
  nonEmpty(inflation, 'inflation');
  let index = ONE;
  return done(
    inflation.map((r, j) => {
      const current = index;
      index = index.times(ONE.plus(rate(r, `inflation[${j}]`)));
      return toDecimalString(current);
    }),
  );
}

/**
 * Factors from a user-entered index path (e.g. a price index 100, 112, 131): `level_j / level_base`.
 * Our extension for categories that follow their own index instead of inflation + escalation.
 */
export function indexFactorsFromLevels(
  levels: DecimalString[],
  baseYear = 0,
): CalculationResult<DecimalString[]> {
  nonEmpty(levels, 'levels');
  if (!Number.isInteger(baseYear) || baseYear < 0 || baseYear >= levels.length) {
    throw new EngineInputError('index.baseOutOfRange', 'baseYear');
  }
  const parsed = levels.map((l, j) => positive(l, 'index.notPositive', `levels[${j}]`));
  const base = parsed[baseYear] ?? ONE;
  return done(parsed.map((l) => toDecimalString(l.div(base))));
}

/** Multiplies each amount by the factor of its year (constant → current prices). */
export function applyFactors(
  amounts: DecimalString[],
  factors: DecimalString[],
): CalculationResult<DecimalString[]> {
  sameLength(factors, amounts.length, 'factors');
  return done(
    amounts.map((a, j) => {
      const factor = positive(factors[j] ?? '1', 'index.notPositive', `factors[${j}]`);
      return toDecimalString(toDecimal(a).times(factor));
    }),
  );
}

export interface RelativeInflationInput {
  /** `R_L`: inflation of the local currency per year. */
  localInflation: DecimalString[];
  /** `R_I`: inflation of the foreign (input) currency per year. */
  foreignInflation: DecimalString[];
}

/**
 * Relative inflation of the local against a foreign currency (manual XI.B):
 * `PR_1 = 1`, `PR_j = Π_{i<j} (1 + R_L,i) / (1 + R_I,i)` — the first year is not inflated.
 */
export function relativeInflationFactors(
  input: RelativeInflationInput,
): CalculationResult<DecimalString[]> {
  nonEmpty(input.localInflation, 'localInflation');
  sameLength(input.foreignInflation, input.localInflation.length, 'foreignInflation');
  let factor = ONE;
  return done(
    input.localInflation.map((local, j) => {
      const current = factor;
      const foreign = rate(input.foreignInflation[j] ?? '0', `foreignInflation[${j}]`);
      factor = factor.times(ONE.plus(rate(local, `localInflation[${j}]`))).div(ONE.plus(foreign));
      return toDecimalString(current);
    }),
  );
}

/**
 * Exchange-rate path derived from relative inflation (COMFAR rule): `ER_j = PR_j × ER_0`, in local
 * units per foreign unit. The user may instead enter the path directly (our extension); then this
 * function is not used.
 */
export function derivedExchangeRates(
  input: RelativeInflationInput & { initialRate: DecimalString },
): CalculationResult<DecimalString[]> {
  const initial = positive(input.initialRate, 'exchangeRate.notPositive', 'initialRate');
  const factors = relativeInflationFactors(input).value;
  return done(factors.map((f) => toDecimalString(toDecimal(f).times(initial))));
}

/** Converts foreign amounts to local currency at each period's rate: `P_L = P_I × ER`. */
export function convertCurrency(
  amounts: DecimalString[],
  exchangeRates: DecimalString[],
): CalculationResult<DecimalString[]> {
  sameLength(exchangeRates, amounts.length, 'exchangeRates');
  return done(
    amounts.map((a, j) => {
      const er = positive(
        exchangeRates[j] ?? '0',
        'exchangeRate.notPositive',
        `exchangeRates[${j}]`,
      );
      return toDecimalString(toDecimal(a).times(er));
    }),
  );
}

export interface ForeignLoanPeriod {
  /** Amounts in the loan's own currency. */
  disbursement: DecimalString;
  repayment: DecimalString;
  capitalisedInterest: DecimalString;
  /** Interest paid in the period. */
  interest: DecimalString;
  /** Fees paid in the period. */
  fees: DecimalString;
  /**
   * Balance at the end of the period in the loan's currency, as the schedule computed it (e.g.
   * `loanPeriods`). When given it replaces the running sum of the flows, whose rounding in the 34th
   * digit could otherwise leave a residue or a tiny negative balance after the last repayment.
   */
  closingBalance?: DecimalString;
}

export interface ForeignLoanLocalPeriod {
  beginningBalance: DecimalString;
  disbursement: DecimalString;
  repayment: DecimalString;
  capitalisedInterest: DecimalString;
  interest: DecimalString;
  fees: DecimalString;
  endingBalance: DecimalString;
  /** `ADJ_j`: exchange loss (positive) or gain (negative) from restating the balance. */
  exchangeAdjustment: DecimalString;
}

/**
 * A foreign-currency loan computed in its own currency (ST-33.05), restated in local currency
 * (manual XI.B–C): flows at the period's rate, the closing balance at the period's rate, and
 * `ADJ_j = B_{j+1} − (B_j + D_j − R_j + CI_j)` in local currency, where `B_j` is the previous local
 * closing balance. The opening balance of the first period is converted at the first period's rate.
 */
export function foreignLoanToLocal(
  input: { openingBalance: DecimalString; periods: ForeignLoanPeriod[] },
  exchangeRates: DecimalString[],
): CalculationResult<ForeignLoanLocalPeriod[]> {
  nonEmpty(input.periods, 'periods');
  sameLength(exchangeRates, input.periods.length, 'exchangeRates');
  const amount = (value: DecimalString, field: string) => {
    const parsed = toDecimal(value);
    if (parsed.isNegative() && !parsed.isZero())
      throw new EngineInputError('amount.negative', field);
    return parsed;
  };
  let foreignBalance = amount(input.openingBalance, 'openingBalance');
  let localBalance: Decimal | undefined;
  const value = input.periods.map((p, j): ForeignLoanLocalPeriod => {
    const er = positive(exchangeRates[j] ?? '0', 'exchangeRate.notPositive', `exchangeRates[${j}]`);
    const d = amount(p.disbursement, `periods[${j}].disbursement`);
    const r = amount(p.repayment, `periods[${j}].repayment`);
    const ci = amount(p.capitalisedInterest, `periods[${j}].capitalisedInterest`);
    const interest = amount(p.interest, `periods[${j}].interest`);
    const fees = amount(p.fees, `periods[${j}].fees`);
    const opening = localBalance ?? foreignBalance.times(er);
    const foreignOpening = foreignBalance;
    foreignBalance =
      p.closingBalance === undefined
        ? foreignBalance.plus(d).minus(r).plus(ci)
        : toDecimal(p.closingBalance);
    if (foreignBalance.isNegative() && !foreignBalance.isZero()) {
      throw new EngineInputError('loan.negativeBalance', `periods[${j}].repayment`);
    }
    const closing = foreignBalance.times(er);
    // ADJ = B_{j+1} − (B_j + D − R + CI) in local currency; the flows cancel, leaving the opening
    // foreign balance restated at this period's rate. Computed that way, a constant rate books
    // exactly 0, and a rounding gap between the schedule's closing balance and the period sums
    // is not mistaken for an exchange gain or loss.
    localBalance = closing;
    return {
      beginningBalance: toDecimalString(opening),
      disbursement: toDecimalString(d.times(er)),
      repayment: toDecimalString(r.times(er)),
      capitalisedInterest: toDecimalString(ci.times(er)),
      interest: toDecimalString(interest.times(er)),
      fees: toDecimalString(fees.times(er)),
      endingBalance: toDecimalString(closing),
      exchangeAdjustment: toDecimalString(foreignOpening.times(er).minus(opening)),
    };
  });
  return done(value);
}
