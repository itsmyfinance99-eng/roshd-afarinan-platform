import {
  ONE,
  ZERO,
  toDecimal,
  toDecimalString,
  type Decimal,
  type DecimalString,
} from '../decimal';
import { discountedPaybackPeriod, paybackPeriod, type PaybackValue } from '../indicators';
import { irr, mirr } from '../irr';
import {
  DEFAULT_DISCOUNT_REFERENCE,
  npv,
  periodDiscountFactors,
  type DiscountReference,
  type TimedSeries,
} from '../time-value';
import type { CalculationResult, CalculationWarning, DefaultUsed } from '../types';

/**
 * A discounted cash flow and its indicators (manual XI.D–F; comfar-model-spec §4.1–4.2), shared by
 * the financial statements and the incremental analysis: net flow per project period, the residual
 * value in the year after production or on its last day, and — for an expansion or rehabilitation
 * project — the starting balance deducted on the day before the first period.
 */

export type IndicatorScope = 'ALL' | 'NPV' | 'NPV_AND_IRR';

export interface DiscountedCashFlow {
  /**
   * One column per project period, plus the year after production when residual values return
   * there (`salvageColumn`). Otherwise the residual value is in the last period's net flow.
   */
  salvageColumn: boolean;
  inflow: DecimalString[];
  outflow: DecimalString[];
  residualValue: DecimalString;
  /**
   * Expansion projects only (XI.F): the starting balance the flow is charged with on the day
   * before the first period — fixed assets plus current assets less current liabilities for the
   * total capital, the starting equity for the equity. It has no column of its own: the cumulative
   * lines start from it and the indicators include it.
   */
  startingBalance?: DecimalString;
  /** Present value of the starting balance (a positive amount, like `startingBalance`). */
  startingBalancePresentValue?: DecimalString;
  net: DecimalString[];
  cumulative: DecimalString[];
  presentValue: DecimalString[];
  cumulativePresentValue: DecimalString[];
  npv: DecimalString;
  irr?: DecimalString;
  mirr?: DecimalString;
  payback?: PaybackValue;
  dynamicPayback?: PaybackValue;
}

export interface DiscountedFlowInput {
  basis: 'totalCapital' | 'equity';
  /** Net flow of each project period, without the residual value. */
  net: Decimal[];
  residual: Decimal;
  /** Charged on the day before the first period; absent for a new project. */
  startingBalance?: Decimal;
  /** Months of each project period. */
  months: number[];
  /** Annual discount rate of each project period. */
  rates: DecimalString[];
  salvageColumn: boolean;
  reference?: DiscountReference;
  reinvestmentRate?: DecimalString;
  borrowingRate?: DecimalString;
  scope: IndicatorScope;
}

export interface DiscountedFlow {
  /** Every line of the result but `inflow` and `outflow`, which the caller knows. */
  result: Omit<DiscountedCashFlow, 'inflow' | 'outflow'>;
  /**
   * The series the indicators were computed on and its rate path: the project periods, preceded by
   * a column of no length for the starting balance (`openingColumn`) and followed by the year
   * after production when residual values return there.
   */
  series: TimedSeries;
  rates: DecimalString[];
  openingColumn: boolean;
  warnings: CalculationWarning[];
  defaultsUsed: DefaultUsed[];
}

const strings = (row: Decimal[]) => row.map((v) => toDecimalString(v));
const cumulative = (row: Decimal[]) => {
  let sum = ZERO;
  return row.map((v) => (sum = sum.plus(v)));
};

/** NPV, IRR, MIRR and the payback periods of a net cash flow. */
export function discountedFlow(input: DiscountedFlowInput): DiscountedFlow {
  const { basis, net, residual, months, rates, salvageColumn, reference, scope } = input;
  const warnings: CalculationWarning[] = [];
  const defaultsUsed: DefaultUsed[] = [];
  const last = net.length - 1;
  // A starting balance of zero charges nothing and needs no column.
  const opening = input.startingBalance;
  const openingColumn = opening !== undefined && !opening.isZero();
  const periodAmounts = salvageColumn
    ? [...net, residual]
    : net.map((v, j) => (j === last ? v.plus(residual) : v));
  const periodMonths = salvageColumn ? [...months, 12] : months;
  // The year after production is discounted at the rate of the last period.
  const periodRates = salvageColumn ? [...rates, rates[last] ?? '0'] : rates;
  const amounts = openingColumn ? [opening.neg(), ...periodAmounts] : periodAmounts;
  const series: TimedSeries = {
    periodMonths: openingColumn ? [0, ...periodMonths] : periodMonths,
    amounts: strings(amounts),
  };
  const path = openingColumn ? [periodRates[0] ?? '0', ...periodRates] : periodRates;
  const options = { annualRate: path, ...(reference === undefined ? {} : { reference }) };
  const factors = periodDiscountFactors(series.periodMonths, options);
  const present = amounts.map((v, j) => v.div(factors[j] ?? ONE));
  // Periods are reported from 1 and without the column of the starting balance.
  const shift = openingColumn ? 1 : 0;
  const collect = <T>(calculation: CalculationResult<T>): T => {
    for (const w of calculation.warnings) {
      const period = w.params?.period;
      warnings.push({
        ...w,
        params: {
          ...w.params,
          ...(period === undefined
            ? {}
            : { period: toDecimalString(toDecimal(period).minus(shift)) }),
          basis,
        },
      });
    }
    for (const d of calculation.defaultsUsed) {
      if (d.key === 'discounting.referenceDate') {
        if (!defaultsUsed.some((x) => x.key === d.key)) defaultsUsed.push(d);
      } else defaultsUsed.push({ ...d, item: basis });
    }
    return calculation.value;
  };
  const payback = (value: PaybackValue | undefined): PaybackValue | undefined =>
    value === undefined ? undefined : { ...value, period: value.period - shift };
  const totalMonths = series.periodMonths.reduce((s, m) => s + m, 0);
  const referenceMonth =
    (reference ?? DEFAULT_DISCOUNT_REFERENCE) === 'START_OF_FIRST_PERIOD' ? 0 : 12;
  const rateOfReturn = scope === 'NPV' ? undefined : collect(irr(series));
  let modified: DecimalString | undefined;
  if (scope !== 'ALL') {
    // Left out on request.
  } else if (totalMonths > referenceMonth) {
    modified = collect(
      mirr(series, {
        ...(reference === undefined ? {} : { reference }),
        ...(input.reinvestmentRate === undefined
          ? {}
          : { reinvestmentRate: input.reinvestmentRate }),
        ...(input.borrowingRate === undefined ? {} : { borrowingRate: input.borrowingRate }),
      }),
    );
  } else {
    warnings.push({ code: 'mirr.horizonTooShort', params: { basis } });
  }
  const normalPayback = scope === 'ALL' ? payback(collect(paybackPeriod(series))) : undefined;
  const dynamicPayback =
    scope === 'ALL'
      ? payback(collect(discountedPaybackPeriod(series, { annualRate: path })))
      : undefined;
  const result: DiscountedFlow['result'] = {
    salvageColumn,
    residualValue: toDecimalString(residual),
    ...(opening === undefined
      ? {}
      : {
          startingBalance: toDecimalString(opening),
          startingBalancePresentValue: toDecimalString(
            openingColumn ? (present[0] ?? ZERO).neg() : ZERO,
          ),
        }),
    net: strings(periodAmounts),
    cumulative: strings(cumulative(amounts).slice(shift)),
    presentValue: strings(present.slice(shift)),
    cumulativePresentValue: strings(cumulative(present).slice(shift)),
    npv: collect(npv(series, options)),
    ...(rateOfReturn === undefined ? {} : { irr: rateOfReturn }),
    ...(modified === undefined ? {} : { mirr: modified }),
    ...(normalPayback === undefined ? {} : { payback: normalPayback }),
    ...(dynamicPayback === undefined ? {} : { dynamicPayback }),
  };
  return { result, series, rates: path, openingColumn, warnings, defaultsUsed };
}
