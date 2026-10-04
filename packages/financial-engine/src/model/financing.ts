import { ZERO, toDecimal, toDecimalString, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import { foreignLoanToLocal, type ForeignLoanLocalPeriod } from '../indexation';
import { loanPeriods, loanSchedule, type LoanInput } from '../loans';
import type { CalculationResult, CalculationWarning, CurrencyCode, DefaultUsed } from '../types';
import { MODEL_VERSION } from '../version';
import {
  depreciateAcquisitions,
  periodAmounts,
  withField,
  type AssetDepreciation,
} from './asset-depreciation';
import type { PlanningHorizon } from './horizon';
import { checkOrigin, ratesFor, uniqueKeys, type Origin } from './investment';
import { startingAmount, startingByKey, type FinancingStartingBalances } from './starting-balances';

/**
 * Sources of finance (manual VII.R, XI.M, X.C.5; comfar-model-spec §4.8.2): equity contributions
 * by class and long-term loans, each loan scheduled in its own currency and restated in local
 * currency per project period. Interest capitalised, and interest and fees paid during
 * construction, are pre-production expenditures: they are excluded from the total investment cost
 * (X.C.2) and depreciated with the loan's own conditions (salvage 0). Cash-flow balancing and the
 * automatic coverage of deficits come with the financial statements (ST-34.04).
 */

export const EQUITY_CLASSES = ['ORDINARY', 'PREFERENCE', 'JOINT_VENTURE', 'SUBSIDY'] as const;
export type EquityClass = (typeof EQUITY_CLASSES)[number];

export interface EquityContribution {
  key: string;
  class: EquityClass;
  currency: CurrencyCode;
  origin: Origin;
  /** Paid-in amounts per project period in the contribution's currency. */
  amounts: DecimalString[];
  /**
   * Equity paid out again (capital refund, VII.R.1) per project period in the contribution's
   * currency, as positive amounts; none when absent. Not for subsidies and grants.
   */
  refunds?: DecimalString[];
}

export interface FinancingLoan {
  key: string;
  currency: CurrencyCode;
  origin: Origin;
  /**
   * The loan in its own currency, with days on the horizon's 30/360 calendar. The end of
   * construction and of the horizon are taken from the horizon.
   */
  loan: Omit<LoanInput, 'constructionEndDay' | 'horizonEndDay'>;
  /** Depreciation of the loan's pre-production interest and fees (salvage 0); none when absent. */
  depreciation?: Omit<AssetDepreciation, 'salvageRate'>;
}

export interface FinancingInput {
  horizon: PlanningHorizon;
  localCurrency: CurrencyCode;
  /** Local units per unit of each foreign currency, one rate per project period. */
  exchangeRates: Record<CurrencyCode, DecimalString[]>;
  equity: EquityContribution[];
  loans: FinancingLoan[];
  /** Existing loans and equity of an expansion or rehabilitation project. */
  startingBalances?: FinancingStartingBalances;
}

export interface FinancingLoanSchedule {
  key: string;
  currency: CurrencyCode;
  origin: Origin;
  /** Per period in local currency (`exchangeAdjustment` is 0 for a local-currency loan). */
  periods: ForeignLoanLocalPeriod[];
  /** Capitalised interest, plus interest and fees paid in construction periods. */
  preProductionInterest: DecimalString[];
  depreciation: DecimalString[];
  bookValue: DecimalString[];
  /** Day of the first repayment used (entered, or COMFAR's default). */
  firstRepaymentDay?: number;
  /** Balance on the day before the first period, in local currency (expansion projects only). */
  startingBalance?: DecimalString;
}

export interface FinancingSchedule {
  equity: {
    items: {
      key: string;
      class: EquityClass;
      origin: Origin;
      amounts: DecimalString[];
      /** Equity refunded per period, in local currency (only when refunds were entered). */
      refunds?: DecimalString[];
      /** Equity held on the day before the first period (expansion projects only). */
      startingBalance?: DecimalString;
    }[];
    /** Every class is listed, zero when it has no contributions. */
    classes: Record<EquityClass, DecimalString[]>;
    byOrigin: { foreign: DecimalString[]; local: DecimalString[] };
    total: DecimalString[];
    /** Equity refunded per period: by class and in total (zero without refunds). */
    refunds: { classes: Record<EquityClass, DecimalString[]>; total: DecimalString[] };
  };
  loans: FinancingLoanSchedule[];
  /** All loans together, per period, in local currency. */
  loanTotals: ForeignLoanLocalPeriod[];
  /** Interest and fees that are pre-production expenditures (X.C.2 «interest accrued»). */
  preProductionInterest: DecimalString[];
  /** Depreciation and book value of the pre-production interest of all loans. */
  interestDepreciation: DecimalString[];
  interestBookValue: DecimalString[];
  /** Equity paid in plus loan disbursements (cash sources) per period. */
  totalSources: DecimalString[];
  /**
   * Long-term debt and equity of the existing enterprise on the day before the first period, in
   * local currency (expansion projects only). A foreign loan is converted at the first period's
   * exchange rate.
   */
  startingBalance?: {
    debt: DecimalString;
    equity: Record<EquityClass, DecimalString>;
    totalEquity: DecimalString;
  };
}

const LOAN_FIELDS = [
  'beginningBalance',
  'disbursement',
  'repayment',
  'capitalisedInterest',
  'interest',
  'fees',
  'endingBalance',
  'exchangeAdjustment',
] as const satisfies readonly (keyof ForeignLoanLocalPeriod)[];

const strings = (values: Decimal[]) => values.map((v) => toDecimalString(v));
const sumRows = (rows: Decimal[][], length: number) =>
  Array.from({ length }, (_, j) => rows.reduce((s, row) => s.plus(row[j] ?? ZERO), ZERO));

/** Equity and loan schedules per project period, in local currency. */
export function financingSchedule(input: FinancingInput): CalculationResult<FinancingSchedule> {
  const { horizon } = input;
  const length = horizon.periods.length;
  const warnings: CalculationWarning[] = [];
  const defaultsUsed: DefaultUsed[] = [];
  uniqueKeys(
    input.equity.map((e) => e.key),
    'equity',
  );
  uniqueKeys(
    input.loans.map((l) => l.key),
    'loans',
  );

  const startingEquity = startingByKey(
    input.startingBalances?.equity,
    'startingBalances.equity',
    'equity',
    (entry) => entry.equity,
    (key) => input.equity.some((e) => e.key === key),
    (entry, field) => startingAmount(entry.value, `${field}.value`),
  );
  const startingLoans = startingByKey(
    input.startingBalances?.loans,
    'startingBalances.loans',
    'loan',
    (entry) => entry.loan,
    (key) => input.loans.some((l) => l.key === key),
    (entry, field) => startingAmount(entry.balance, `${field}.balance`),
  );

  const equity = input.equity.map((e, i) => {
    const field = `equity[${i}]`;
    if (!(EQUITY_CLASSES as readonly string[]).includes(e.class)) {
      throw new EngineInputError('financing.equityClass', `${field}.class`);
    }
    checkOrigin(e.origin, `${field}.origin`);
    const own = periodAmounts(e.amounts, length, `${field}.amounts`);
    const rates = ratesFor(e.currency, input, length, `${field}.currency`);
    const toLocal = (values: Decimal[]) =>
      rates === undefined ? values : values.map((a, j) => a.times(rates[j] ?? ZERO));
    const opening = startingEquity.get(e.key);
    let refunds: Decimal[] | undefined;
    if (e.refunds !== undefined) {
      const paidOut = periodAmounts(e.refunds, length, `${field}.refunds`);
      // The equity held never turns negative (VII.R.1). It is counted in the contribution's own
      // currency; a starting balance is in local currency and is converted at the first rate.
      const rate = rates?.[0];
      let held =
        opening === undefined
          ? ZERO
          : rate === undefined || rate.isZero()
            ? opening
            : opening.div(rate);
      paidOut.forEach((refund, j) => {
        held = held.plus(own[j] ?? ZERO).minus(refund);
        if (!refund.isZero() && e.class === 'SUBSIDY') {
          throw new EngineInputError('financing.subsidyRefund', `${field}.refunds[${j}]`);
        }
        if (held.isNegative()) {
          throw new EngineInputError('financing.refundExceedsEquity', `${field}.refunds[${j}]`);
        }
      });
      refunds = toLocal(paidOut);
    }
    return { e, local: toLocal(own), opening, refunds };
  });

  const periodEndDays = horizon.periods.map((p) => p.endDay);
  const loans = input.loans.map((l, i): FinancingLoanSchedule => {
    const field = `loans[${i}]`;
    checkOrigin(l.origin, `${field}.origin`);
    const rates = ratesFor(l.currency, input, length, `${field}.currency`);
    // VII.R: depreciation of capitalised interest starts no earlier than the month after the last
    // day on which interest is capitalised.
    const startAt =
      l.depreciation === undefined ? undefined : horizon.periods[l.depreciation.startPeriod];
    // Only when interest is actually capitalised; with a share of 0 the day has no effect.
    const capitaliseUntil = toDecimal(l.loan.capitalisedShare).gt(0)
      ? l.loan.capitaliseUntilDay
      : undefined;
    if (
      startAt !== undefined &&
      capitaliseUntil !== undefined &&
      startAt.startMonth * 30 < capitaliseUntil
    ) {
      throw new EngineInputError(
        'financing.interestDepreciationStart',
        `${field}.depreciation.startPeriod`,
      );
    }
    const opening = startingLoans.get(l.key);
    const openingBalance = toDecimalString(opening ?? ZERO);
    const schedule = withField(`${field}.loan`, () =>
      loanSchedule({
        ...l.loan,
        ...(opening === undefined ? {} : { openingBalance }),
        // Day indices start at 1; without a construction phase the default first repayment
        // follows the last disbursement alone.
        constructionEndDay: horizon.constructionEndDay > 0 ? horizon.constructionEndDay : 1,
        horizonEndDay: horizon.totalMonths * 30,
      }),
    );
    const own = loanPeriods(schedule.value, periodEndDays, openingBalance);
    // The schedule and the period sums may both report the same thing (e.g. beyond the horizon).
    const codes = new Set<string>();
    for (const w of [...schedule.warnings, ...own.warnings]) {
      if (codes.has(w.code)) continue;
      codes.add(w.code);
      warnings.push({ ...w, params: { ...w.params, item: l.key } });
    }
    for (const d of schedule.defaultsUsed) defaultsUsed.push({ ...d, item: l.key });
    const periods =
      rates === undefined
        ? own.value.map((p): ForeignLoanLocalPeriod => ({
            beginningBalance: p.openingBalance,
            disbursement: p.disbursement,
            repayment: p.repayment,
            capitalisedInterest: p.capitalisedInterest,
            interest: p.interest,
            fees: p.fees,
            endingBalance: p.closingBalance,
            exchangeAdjustment: '0',
          }))
        : withField(field, () =>
            foreignLoanToLocal(
              { openingBalance, periods: own.value },
              rates.map((v) => toDecimalString(v)),
            ),
          ).value;
    const preProduction = periods.map((p, j) => {
      const capitalised = toDecimal(p.capitalisedInterest);
      return horizon.periods[j]?.phase === 'CONSTRUCTION'
        ? capitalised.plus(p.interest).plus(p.fees)
        : capitalised;
    });
    const book = depreciateAcquisitions(
      horizon,
      preProduction,
      l.depreciation === undefined ? undefined : { ...l.depreciation, salvageRate: '0' },
      `${field}.depreciation`,
    );
    return {
      key: l.key,
      currency: l.currency,
      origin: l.origin,
      periods,
      preProductionInterest: strings(preProduction),
      depreciation: book.depreciation,
      bookValue: book.bookValue,
      ...(schedule.value.firstRepaymentDay === undefined
        ? {}
        : { firstRepaymentDay: schedule.value.firstRepaymentDay }),
      ...(opening === undefined
        ? {}
        : { startingBalance: periods[0]?.beginningBalance ?? openingBalance }),
    };
  });

  const column = (rows: DecimalString[][]) =>
    strings(
      sumRows(
        rows.map((r) => r.map((v) => toDecimal(v))),
        length,
      ),
    );
  const loanTotals = Array.from({ length }, (_, j) => {
    const row = {} as ForeignLoanLocalPeriod;
    for (const key of LOAN_FIELDS) {
      row[key] = toDecimalString(
        loans.reduce((s, l) => s.plus(toDecimal(l.periods[j]?.[key] ?? '0')), ZERO),
      );
    }
    return row;
  });
  const equityTotal = sumRows(
    equity.map((e) => e.local),
    length,
  );
  const refundsOf = (equityClass?: EquityClass) =>
    sumRows(
      equity
        .filter((x) => equityClass === undefined || x.e.class === equityClass)
        .map((x) => x.refunds ?? []),
      length,
    );
  const startingEquityOf = (equityClass?: EquityClass) =>
    equity
      .filter((x) => equityClass === undefined || x.e.class === equityClass)
      .reduce((s, x) => s.plus(x.opening ?? ZERO), ZERO);
  const value: FinancingSchedule = {
    equity: {
      items: equity.map(({ e, local, opening, refunds }) => ({
        key: e.key,
        class: e.class,
        origin: e.origin,
        amounts: strings(local),
        ...(refunds === undefined ? {} : { refunds: strings(refunds) }),
        ...(opening === undefined ? {} : { startingBalance: toDecimalString(opening) }),
      })),
      classes: Object.fromEntries(
        EQUITY_CLASSES.map((c) => [
          c,
          strings(
            sumRows(
              equity.filter((x) => x.e.class === c).map((x) => x.local),
              length,
            ),
          ),
        ]),
      ) as Record<EquityClass, DecimalString[]>,
      byOrigin: {
        foreign: strings(
          sumRows(
            equity.filter((x) => x.e.origin === 'FOREIGN').map((x) => x.local),
            length,
          ),
        ),
        local: strings(
          sumRows(
            equity.filter((x) => x.e.origin === 'LOCAL').map((x) => x.local),
            length,
          ),
        ),
      },
      total: strings(equityTotal),
      refunds: {
        classes: Object.fromEntries(
          EQUITY_CLASSES.map((c) => [c, strings(refundsOf(c))]),
        ) as Record<EquityClass, DecimalString[]>,
        total: strings(refundsOf()),
      },
    },
    loans,
    loanTotals,
    preProductionInterest: column(loans.map((l) => l.preProductionInterest)),
    interestDepreciation: column(loans.map((l) => l.depreciation)),
    interestBookValue: column(loans.map((l) => l.bookValue)),
    totalSources: equityTotal.map((e, j) =>
      toDecimalString(e.plus(loanTotals[j]?.disbursement ?? '0')),
    ),
    ...(input.startingBalances === undefined
      ? {}
      : {
          startingBalance: {
            debt: toDecimalString(loans.reduce((s, l) => s.plus(l.startingBalance ?? '0'), ZERO)),
            equity: Object.fromEntries(
              EQUITY_CLASSES.map((c) => [c, toDecimalString(startingEquityOf(c))]),
            ) as Record<EquityClass, DecimalString>,
            totalEquity: toDecimalString(startingEquityOf()),
          },
        }),
  };
  return { value, modelVersion: MODEL_VERSION, warnings, defaultsUsed };
}
