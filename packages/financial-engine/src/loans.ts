import { Decimal, ONE, ZERO, toDecimal, toDecimalString, type DecimalString } from './decimal';
import { EngineInputError } from './errors';
import type { CalculationResult, CalculationWarning, DefaultUsed } from './types';
import { MODEL_VERSION } from './version';

/**
 * Long- and medium-term loans (comfar-model-spec §4.8; manual XI.M, VII.R): annuity, constant
 * principal and profile loans, interest by sub-intervals, capitalised interest, fees.
 *
 * Dates are **day indices on the 30/360 calendar**: the number of days from the start of the
 * horizon to the end of the date, with 30-day months (day 30 = end of month 1, day 360 = end of
 * year 1, day 361 = first day of year 2). Interest for `n` days is `balance × rate × n / 360`, which
 * is COMFAR's `m/12 + d/360`. Converting calendar dates to day indices is the model layer's job.
 * Amounts are in the loan's own currency; `foreignLoanToLocal` restates them.
 */

export type LoanType = 'ANNUITY' | 'CONSTANT_PRINCIPAL' | 'PROFILE';

export interface LoanFlow {
  /** Day index (≥ 1) of the flow. */
  day: number;
  /** Disbursement (positive) or repayment (negative; profile loans and the disbursement phase). */
  amount: DecimalString;
}

export interface LoanRate {
  /** First day the annual rate applies to. */
  fromDay: number;
  /** Annual interest rate as a fraction, ≥ 0. */
  rate: DecimalString;
}

export interface LoanFees {
  /** On every positive disbursement, paid with it. */
  agency?: DecimalString;
  /** Per year on the outstanding balance, paid with interest. */
  guarantee?: DecimalString;
  /** Per year on the undisbursed part of the total disbursements, paid with interest. */
  commitment?: DecimalString;
  /** Once, on the total of disbursements, at the first disbursement. */
  other?: DecimalString;
}

export interface LoanInput {
  type: LoanType;
  /** LP: months between repayments and interest due dates (1, 3, 6 or 12). */
  repaymentMonths: 1 | 3 | 6 | 12;
  flows: LoanFlow[];
  /** Rate path; every rate applies from its day until the next one. */
  rates: LoanRate[];
  /** Share of interest due in the disbursement phase that is capitalised, 0 … 1; the rest is paid. */
  capitalisedShare: DecimalString;
  /** Last interest due day on which interest is capitalised; required when the share is above 0. */
  capitaliseUntilDay?: number;
  /** Annuity and constant principal: number of repayments. */
  numberOfRepayments?: number;
  /**
   * Annuity and constant principal: day of the first repayment, a month end (multiple of 30). When
   * omitted, COMFAR's rule applies (owner decision) and is reported in `defaultsUsed`.
   */
  firstRepaymentDay?: number;
  /** Last day of the construction phase; needed for the default first repayment date. */
  constructionEndDay?: number;
  /** Profile loans: a month end on which interest is due; due dates repeat every LP months. */
  interestDueDay?: number;
  /** Last day of the planning horizon; required for profile loans. */
  horizonEndDay?: number;
  fees?: LoanFees;
  /**
   * Balance of an existing loan on the day before day 1 (expansion and rehabilitation projects,
   * XI.M). Interest accrues on it from day 1; such a loan needs no disbursement.
   */
  openingBalance?: DecimalString;
}

export type LoanEventKind =
  | 'DISBURSEMENT'
  | 'REPAYMENT'
  | 'INTEREST_PAID'
  | 'INTEREST_CAPITALISED'
  | 'FEE_AGENCY'
  | 'FEE_GUARANTEE'
  | 'FEE_COMMITMENT'
  | 'FEE_OTHER';

export interface LoanEvent {
  day: number;
  kind: LoanEventKind;
  amount: DecimalString;
  /** Loan balance after the event. */
  balance: DecimalString;
}

export interface LoanSchedule {
  events: LoanEvent[];
  /** Annuity and constant principal: the first repayment day used. */
  firstRepaymentDay?: number;
  /** Annuity and constant principal: last day on which a disbursement is accepted. */
  disbursementUntilDay?: number;
  /** Annuity and constant principal: debt at the end of the disbursement phase (`DB_n`). */
  debtAtRepaymentStart?: DecimalString;
  totalDisbursed: DecimalString;
  totalCapitalisedInterest: DecimalString;
  totalRepaid: DecimalString;
  totalInterestPaid: DecimalString;
  totalFees: DecimalString;
  /** Balance after the last event (0 when the loan is fully repaid). */
  finalBalance: DecimalString;
}

const DAYS_PER_YEAR = new Decimal(360);
const MONTH = 30;
/** 100 years of 30/360 days; bounds the timeline the schedule walks. */
const MAX_DAY = 36_000;
const MAX_REPAYMENTS = 1_200;

function wholeDay(day: number, field: string): void {
  if (!Number.isInteger(day) || day < 1 || day > MAX_DAY) {
    throw new EngineInputError('loan.dayInvalid', field);
  }
}

function monthEnd(day: number, field: string): void {
  wholeDay(day, field);
  if (day % MONTH !== 0) throw new EngineInputError('loan.notMonthEnd', field);
}

function nonNegativeRate(value: DecimalString | undefined, field: string): Decimal {
  if (value === undefined) return ZERO;
  const parsed = toDecimal(value);
  if (parsed.isNegative() && !parsed.isZero()) throw new EngineInputError('rate.negative', field);
  return parsed;
}

/**
 * COMFAR's default first repayment: one repayment period after the last disbursement or after the
 * start of production, whichever is later, on a month end.
 */
export function defaultFirstRepaymentDay(
  lastDisbursementDay: number,
  constructionEndDay: number,
  repaymentMonths: number,
): number {
  const from = lastDisbursementDay > constructionEndDay ? lastDisbursementDay : constructionEndDay;
  const day = from + repaymentMonths * MONTH;
  return day % MONTH === 0 ? day : day + MONTH - (day % MONTH);
}

interface Stop {
  day: number;
  due: boolean;
  repayment: boolean;
  flows: Decimal[];
  rate?: Decimal;
}

/** Schedule of one loan: every disbursement, interest and fee payment and repayment by day. */
export function loanSchedule(input: LoanInput): CalculationResult<LoanSchedule> {
  const warnings: CalculationWarning[] = [];
  const defaultsUsed: DefaultUsed[] = [];
  const period = input.repaymentMonths * MONTH;
  if (![1, 3, 6, 12].includes(input.repaymentMonths)) {
    throw new EngineInputError('loan.repaymentMonths', 'repaymentMonths');
  }
  const opening = toDecimal(input.openingBalance ?? '0');
  if (opening.isNegative()) throw new EngineInputError('amount.negative', 'openingBalance');
  const existing = opening.gt(0);
  if (input.flows.length === 0 && !existing) {
    throw new EngineInputError('loan.noDisbursement', 'flows');
  }
  const flows = input.flows
    .map((f, i) => {
      wholeDay(f.day, `flows[${i}].day`);
      return { day: f.day, amount: toDecimal(f.amount) };
    })
    // By day; on one day disbursements come before repayments, so the day nets out.
    .sort((a, b) => a.day - b.day || b.amount.cmp(a.amount));
  // An existing loan is outstanding from the day before day 1.
  const firstDay = existing ? 0 : (flows[0]?.day ?? 1);
  const totalDisbursed = flows.reduce(
    (sum, f) => (f.amount.gt(0) ? sum.plus(f.amount) : sum),
    ZERO,
  );
  if (!totalDisbursed.gt(0) && !existing) {
    throw new EngineInputError('loan.noDisbursement', 'flows');
  }

  // Rates
  if (input.rates.length === 0) throw new EngineInputError('loan.rateMissing', 'rates');
  const rates = input.rates.map((r, i) => {
    wholeDay(r.fromDay, `rates[${i}].fromDay`);
    if (i > 0 && r.fromDay <= (input.rates[i - 1]?.fromDay ?? 0)) {
      throw new EngineInputError('loan.ratesNotAscending', `rates[${i}].fromDay`);
    }
    return { fromDay: r.fromDay, rate: nonNegativeRate(r.rate, `rates[${i}].rate`) };
  });
  if ((rates[0]?.fromDay ?? 0) > firstDay + 1) {
    throw new EngineInputError('loan.rateMissing', 'rates[0].fromDay');
  }

  const share = toDecimal(input.capitalisedShare);
  if (share.isNegative() || share.gt(1)) {
    throw new EngineInputError('loan.capitalisedShare', 'capitalisedShare');
  }
  const capitaliseUntil = input.capitaliseUntilDay;
  if (share.gt(0)) {
    if (capitaliseUntil === undefined) {
      throw new EngineInputError('loan.capitaliseUntilRequired', 'capitaliseUntilDay');
    }
    wholeDay(capitaliseUntil, 'capitaliseUntilDay');
  }
  const fees = {
    agency: nonNegativeRate(input.fees?.agency, 'fees.agency'),
    guarantee: nonNegativeRate(input.fees?.guarantee, 'fees.guarantee'),
    commitment: nonNegativeRate(input.fees?.commitment, 'fees.commitment'),
    other: nonNegativeRate(input.fees?.other, 'fees.other'),
  };

  // Due dates
  const schedule: LoanSchedule = {
    events: [],
    totalDisbursed: '0',
    totalCapitalisedInterest: '0',
    totalRepaid: '0',
    totalInterestPaid: '0',
    totalFees: '0',
    finalBalance: '0',
  };
  const stops = new Map<number, Stop>();
  const stop = (day: number): Stop => {
    let s = stops.get(day);
    if (s === undefined) {
      s = { day, due: false, repayment: false, flows: [] };
      stops.set(day, s);
    }
    return s;
  };
  let repayments = 0;
  let lastDay = firstDay;
  if (input.type === 'PROFILE') {
    if (input.interestDueDay === undefined) {
      throw new EngineInputError('loan.interestDueDayRequired', 'interestDueDay');
    }
    monthEnd(input.interestDueDay, 'interestDueDay');
    if (input.horizonEndDay === undefined) {
      throw new EngineInputError('loan.horizonEndRequired', 'horizonEndDay');
    }
    wholeDay(input.horizonEndDay, 'horizonEndDay');
    const horizonEnd = input.horizonEndDay;
    flows.forEach((f, i) => {
      if (f.day > horizonEnd)
        throw new EngineInputError('loan.flowOutsideHorizon', `flows[${i}].day`);
    });
    // Due dates run back and forward from the given month end; the first one follows the first flow.
    let due = input.interestDueDay;
    while (due > firstDay) due -= period;
    while (due <= firstDay) due += period;
    for (; due <= horizonEnd; due += period) stop(due).due = true;
    // Accrue up to the end of the horizon, so interest still owed there is reported.
    stop(horizonEnd);
    lastDay = horizonEnd;
  } else {
    const n = input.numberOfRepayments;
    if (n === undefined || !Number.isInteger(n) || n < 1 || n > MAX_REPAYMENTS) {
      throw new EngineInputError('loan.numberOfRepayments', 'numberOfRepayments');
    }
    repayments = n;
    let first = input.firstRepaymentDay;
    if (first === undefined) {
      if (input.constructionEndDay === undefined) {
        throw new EngineInputError('loan.firstRepaymentRequired', 'firstRepaymentDay');
      }
      wholeDay(input.constructionEndDay, 'constructionEndDay');
      // The last flow of any sign: repayments in the disbursement phase must stay inside it.
      const lastFlow = flows[flows.length - 1]?.day ?? firstDay;
      first = defaultFirstRepaymentDay(lastFlow, input.constructionEndDay, input.repaymentMonths);
      defaultsUsed.push({ key: 'loan.firstRepaymentDate', value: String(first) });
    }
    if (input.firstRepaymentDay === undefined && first > MAX_DAY) {
      throw new EngineInputError('loan.dayInvalid', 'flows');
    }
    monthEnd(first, 'firstRepaymentDay');
    const until = input.type === 'ANNUITY' ? first - period : first - 1;
    flows.forEach((f, i) => {
      if (f.day > until) {
        throw new EngineInputError('loan.flowAfterDisbursementPhase', `flows[${i}].day`, {
          until: String(until),
        });
      }
    });
    if (capitaliseUntil !== undefined && share.gt(0) && capitaliseUntil >= first) {
      throw new EngineInputError('loan.capitaliseAfterFirstRepayment', 'capitaliseUntilDay');
    }
    schedule.firstRepaymentDay = first;
    schedule.disbursementUntilDay = until;
    for (let due = first - period; due > firstDay; due -= period) stop(due).due = true;
    for (let i = 0; i < n; i++) {
      const s = stop(first + i * period);
      s.due = true;
      s.repayment = true;
    }
    lastDay = first + (n - 1) * period;
    if (lastDay > MAX_DAY) throw new EngineInputError('loan.dayInvalid', 'numberOfRepayments');
    if (input.horizonEndDay !== undefined) {
      wholeDay(input.horizonEndDay, 'horizonEndDay');
      if (lastDay > input.horizonEndDay) warnings.push({ code: 'loan.beyondHorizon' });
    }
  }
  flows.forEach((f) => stop(f.day).flows.push(f.amount));
  // A rate from day X applies to days X, X + 1, …, i.e. to accrual after day X − 1.
  rates.forEach((r) => {
    if (r.fromDay - 1 >= firstDay && r.fromDay - 1 < lastDay) stop(r.fromDay - 1).rate = r.rate;
  });

  // Walk the timeline
  let rate = rates.filter((r) => r.fromDay - 1 < firstDay).at(-1)?.rate ?? ZERO;
  let balance = opening;
  let drawn = ZERO;
  let interest = ZERO;
  let guaranteeFee = ZERO;
  let commitmentFee = ZERO;
  let previousDay = firstDay;
  let repaid = 0;
  let constantPrincipal: Decimal | undefined;
  let firstDisbursement = true;
  const totals = { capitalised: ZERO, repaid: ZERO, interest: ZERO, fees: ZERO };
  const emit = (day: number, kind: LoanEventKind, amount: Decimal) => {
    if (amount.isZero()) return;
    schedule.events.push({
      day,
      kind,
      amount: toDecimalString(amount),
      balance: toDecimalString(balance),
    });
  };

  const ordered = [...stops.values()].sort((a, b) => a.day - b.day);
  for (const s of ordered) {
    if (s.day < firstDay) continue;
    const years = new Decimal(s.day - previousDay).div(DAYS_PER_YEAR);
    interest = interest.plus(balance.times(rate).times(years));
    guaranteeFee = guaranteeFee.plus(balance.times(fees.guarantee).times(years));
    commitmentFee = commitmentFee.plus(
      totalDisbursed.minus(drawn).times(fees.commitment).times(years),
    );
    previousDay = s.day;

    if (s.due) {
      if (s.repayment) {
        emit(s.day, 'INTEREST_PAID', interest);
        totals.interest = totals.interest.plus(interest);
        if (repaid === 0) schedule.debtAtRepaymentStart = toDecimalString(balance);
        const remaining = repayments - repaid;
        let principal: Decimal;
        if (remaining === 1) principal = balance;
        else if (input.type === 'CONSTANT_PRINCIPAL') {
          constantPrincipal ??= balance.div(repayments);
          principal = constantPrincipal;
        } else {
          principal = annuityPrincipal(balance, interest, remaining);
        }
        balance = balance.minus(principal);
        totals.repaid = totals.repaid.plus(principal);
        emit(s.day, 'REPAYMENT', principal);
        repaid++;
      } else {
        const capitalised =
          capitaliseUntil !== undefined && s.day <= capitaliseUntil ? interest.times(share) : ZERO;
        const paid = interest.minus(capitalised);
        emit(s.day, 'INTEREST_PAID', paid);
        balance = balance.plus(capitalised);
        emit(s.day, 'INTEREST_CAPITALISED', capitalised);
        totals.capitalised = totals.capitalised.plus(capitalised);
        totals.interest = totals.interest.plus(paid);
      }
      emit(s.day, 'FEE_GUARANTEE', guaranteeFee);
      emit(s.day, 'FEE_COMMITMENT', commitmentFee);
      totals.fees = totals.fees.plus(guaranteeFee).plus(commitmentFee);
      interest = ZERO;
      guaranteeFee = ZERO;
      commitmentFee = ZERO;
    }

    for (const amount of s.flows) {
      if (amount.gt(0)) {
        balance = balance.plus(amount);
        drawn = drawn.plus(amount);
        emit(s.day, 'DISBURSEMENT', amount);
        const agency = amount.times(fees.agency);
        emit(s.day, 'FEE_AGENCY', agency);
        totals.fees = totals.fees.plus(agency);
        if (firstDisbursement) {
          const other = totalDisbursed.times(fees.other);
          emit(s.day, 'FEE_OTHER', other);
          totals.fees = totals.fees.plus(other);
          firstDisbursement = false;
        }
      } else if (amount.lt(0)) {
        const repayment = amount.neg();
        if (repayment.gt(balance)) {
          throw new EngineInputError('loan.negativeBalance', 'flows', { day: String(s.day) });
        }
        balance = balance.minus(repayment);
        totals.repaid = totals.repaid.plus(repayment);
        emit(s.day, 'REPAYMENT', repayment);
      }
    }
    if (s.rate !== undefined) rate = s.rate;
  }

  if (input.type === 'PROFILE') {
    if (balance.gt(0)) {
      warnings.push({ code: 'loan.notRepaid', params: { balance: toDecimalString(balance) } });
    }
    const unpaid = interest.plus(guaranteeFee).plus(commitmentFee);
    if (unpaid.gt(0)) {
      warnings.push({
        code: 'loan.interestAfterHorizon',
        params: { amount: toDecimalString(unpaid) },
      });
    }
  }

  schedule.totalDisbursed = toDecimalString(totalDisbursed);
  schedule.totalCapitalisedInterest = toDecimalString(totals.capitalised);
  schedule.totalRepaid = toDecimalString(totals.repaid);
  schedule.totalInterestPaid = toDecimalString(totals.interest);
  schedule.totalFees = toDecimalString(totals.fees);
  schedule.finalBalance = toDecimalString(balance);
  return { value: schedule, modelVersion: MODEL_VERSION, warnings, defaultsUsed };
}

/**
 * Principal of an annuity instalment: `A = B × IR(1 + IR)^n / ((1 + IR)^n − 1)`, principal
 * `A − interest`, with `IR` the interval's effective rate (interest / balance), recomputed on the
 * remaining balance and number of instalments — constant for a constant rate, and following a rate
 * change otherwise. With IR = 0 the constant principal rule applies (manual XI.M).
 */
function annuityPrincipal(balance: Decimal, interest: Decimal, remaining: number): Decimal {
  if (balance.isZero()) return ZERO;
  const ir = interest.div(balance);
  if (ir.isZero()) return balance.div(remaining);
  const growth = ONE.plus(ir).pow(remaining);
  const payment = balance.times(ir).times(growth).div(growth.minus(ONE));
  return payment.minus(interest);
}

export interface LoanPeriod {
  openingBalance: DecimalString;
  disbursement: DecimalString;
  repayment: DecimalString;
  capitalisedInterest: DecimalString;
  /** Interest paid. */
  interest: DecimalString;
  fees: DecimalString;
  closingBalance: DecimalString;
}

const PERIOD_FIELDS: Record<LoanEventKind, keyof LoanPeriod> = {
  DISBURSEMENT: 'disbursement',
  REPAYMENT: 'repayment',
  INTEREST_PAID: 'interest',
  INTEREST_CAPITALISED: 'capitalisedInterest',
  FEE_AGENCY: 'fees',
  FEE_GUARANTEE: 'fees',
  FEE_COMMITMENT: 'fees',
  FEE_OTHER: 'fees',
};

/**
 * Sums a schedule into project periods (flows on the last day of a period belong to it).
 * `periodEndDays` are the last day indices of the periods, ascending. Events after the last period
 * are left out with a warning. Events of one day must stay in the schedule's order (as
 * `loanSchedule` returns them); events of different days may come in any order. `openingBalance`
 * is the balance of an existing loan before the first period.
 */
export function loanPeriods(
  schedule: Pick<LoanSchedule, 'events'>,
  periodEndDays: number[],
  openingBalance: DecimalString = '0',
): CalculationResult<LoanPeriod[]> {
  if (periodEndDays.length === 0) throw new EngineInputError('series.empty', 'periodEndDays');
  periodEndDays.forEach((d, i) => {
    wholeDay(d, `periodEndDays[${i}]`);
    if (i > 0 && d <= (periodEndDays[i - 1] ?? 0)) {
      throw new EngineInputError('loan.periodsNotAscending', `periodEndDays[${i}]`);
    }
  });
  const sums = periodEndDays.map(() => ({
    disbursement: ZERO,
    repayment: ZERO,
    capitalisedInterest: ZERO,
    interest: ZERO,
    fees: ZERO,
    closing: undefined as Decimal | undefined,
  }));
  const warnings: CalculationWarning[] = [];
  let p = 0;
  // Stable sort by day only: within a day the schedule's own order is kept, so the last event of a
  // period carries its closing balance. The balance is taken from the schedule, never re-added
  // from rounded sums (a residue in the 34th digit would leave a repaid loan "outstanding").
  const events = [...schedule.events].sort((a, b) => a.day - b.day);
  for (const e of events) {
    while (p < periodEndDays.length && e.day > (periodEndDays[p] ?? 0)) p++;
    const target = sums[p];
    if (target === undefined) {
      if (warnings.length === 0) warnings.push({ code: 'loan.beyondHorizon' });
      continue;
    }
    const field = PERIOD_FIELDS[e.kind] as keyof Omit<(typeof sums)[number], 'closing'>;
    target[field] = target[field].plus(e.amount);
    target.closing = toDecimal(e.balance);
  }
  let balance = toDecimal(openingBalance);
  const value = sums.map((s): LoanPeriod => {
    const opening = balance;
    balance = s.closing ?? balance;
    return {
      openingBalance: toDecimalString(opening),
      disbursement: toDecimalString(s.disbursement),
      repayment: toDecimalString(s.repayment),
      capitalisedInterest: toDecimalString(s.capitalisedInterest),
      interest: toDecimalString(s.interest),
      fees: toDecimalString(s.fees),
      closingBalance: toDecimalString(balance),
    };
  });
  return { value, modelVersion: MODEL_VERSION, warnings, defaultsUsed: [] };
}

/** Total debt service of several loans (already in one currency), period by period. */
export function sumLoanPeriods(loans: LoanPeriod[][]): CalculationResult<LoanPeriod[]> {
  if (loans.length === 0) throw new EngineInputError('series.empty', 'loans');
  const length = loans[0]?.length ?? 0;
  loans.forEach((l, i) => {
    if (l.length !== length) {
      throw new EngineInputError('series.lengthMismatch', `loans[${i}]`, {
        expected: String(length),
        actual: String(l.length),
      });
    }
  });
  const keys: (keyof LoanPeriod)[] = [
    'openingBalance',
    'disbursement',
    'repayment',
    'capitalisedInterest',
    'interest',
    'fees',
    'closingBalance',
  ];
  const value = Array.from({ length }, (_, j) => {
    const row = {} as LoanPeriod;
    for (const key of keys) {
      row[key] = toDecimalString(
        loans.reduce((sum, l) => sum.plus(toDecimal(l[j]?.[key] ?? '0')), ZERO),
      );
    }
    return row;
  });
  return { value, modelVersion: MODEL_VERSION, warnings: [], defaultsUsed: [] };
}
