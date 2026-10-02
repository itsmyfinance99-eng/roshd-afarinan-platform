import { EngineInputError } from '../errors';

/**
 * Planning horizon with COMFAR's structure (manual VII.G; comfar-model-spec §1): a construction
 * phase of equal periods, a production phase that starts the next month, an optional start-up
 * phase of periodic planning (at most 24 months) at the beginning of production, and yearly
 * periods after it that end on balance dates. The month of balance is chosen by the user; the
 * first production year is shortened when production does not start right after a balance date,
 * so the project always ends on a balance date.
 *
 * Time is counted in whole months from the first day of construction; day indices follow the
 * 30/360 calendar used by loans (day 30 = end of month 1). The calendar is the user's: a start in
 * the Solar Hijri calendar (e.g. Farvardin 1405) with balance month 12 (Esfand) works the same way,
 * because only the month count matters.
 */

export type PeriodLength = 1 | 3 | 6 | 12;
export type PeriodPhase = 'CONSTRUCTION' | 'STARTUP' | 'PRODUCTION';

export interface HorizonInput {
  /** Calendar month in which construction starts on its first day (Solar Hijri or Gregorian). */
  start: { year: number; month: number };
  /** Month (1–12) whose last day is the balance date (end of the financial year). */
  balanceMonth: number;
  construction: { periods: number; periodMonths: PeriodLength };
  /** Periodic planning at the start of production; 0 periods when production is yearly at once. */
  startup: { periods: number; periodMonths: PeriodLength };
  /** Financial years of production, i.e. balance dates from the start of production. */
  productionYears: number;
}

export interface HorizonPeriod {
  index: number;
  phase: PeriodPhase;
  /** Months from the start of the horizon to the start of the period. */
  startMonth: number;
  months: number;
  /** 30/360 day index of the period's last day. */
  endDay: number;
  /** Calendar month of the period's last day. */
  end: { year: number; month: number };
  /** The period ends on a balance date. */
  balanceDate: boolean;
}

export interface BalanceYear {
  /** Financial year of production, from 0. */
  year: number;
  /** Months of production in this year; the first may be partial. */
  months: number;
  /** Months from the start of the horizon to the balance date. */
  endMonth: number;
  endDay: number;
  end: { year: number; month: number };
  /** The period that contains the balance date; yearly amounts (e.g. depreciation) are booked there. */
  period: number;
}

export interface PlanningHorizon {
  periods: HorizonPeriod[];
  /** Months from the start of the horizon to the first day of production. */
  productionStartMonth: number;
  /** Day index of the last day of construction (0 when there is no construction phase). */
  constructionEndDay: number;
  balanceYears: BalanceYear[];
  totalMonths: number;
  /** The year after production, in which residual values return (COMFAR's scrap period). */
  salvage: { endDay: number; end: { year: number; month: number } };
}

const PERIOD_LENGTHS: readonly number[] = [1, 3, 6, 12];
const MAX_STARTUP_MONTHS = 24;
const MAX_HORIZON_MONTHS = 600;
const MONTH_DAYS = 30;

function wholeNumber(value: number, min: number, max: number, field: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new EngineInputError('horizon.outOfRange', field, { min: String(min), max: String(max) });
  }
}

function periodLength(value: number, field: string): void {
  if (!PERIOD_LENGTHS.includes(value)) throw new EngineInputError('horizon.periodLength', field);
}

/** Builds every period of the horizon and the balance dates of production. */
export function planHorizon(input: HorizonInput): PlanningHorizon {
  // Solar Hijri (e.g. 1405) or Gregorian years: month arithmetic is the same (12 months a year).
  wholeNumber(input.start.year, 1300, 2200, 'start.year');
  wholeNumber(input.start.month, 1, 12, 'start.month');
  wholeNumber(input.balanceMonth, 1, 12, 'balanceMonth');
  wholeNumber(input.construction.periods, 0, MAX_HORIZON_MONTHS, 'construction.periods');
  periodLength(input.construction.periodMonths, 'construction.periodMonths');
  wholeNumber(input.startup.periods, 0, MAX_STARTUP_MONTHS, 'startup.periods');
  periodLength(input.startup.periodMonths, 'startup.periodMonths');
  wholeNumber(input.productionYears, 1, 50, 'productionYears');

  const startupMonths = input.startup.periods * input.startup.periodMonths;
  if (startupMonths > MAX_STARTUP_MONTHS) {
    throw new EngineInputError('horizon.startupTooLong', 'startup.periods');
  }

  // Absolute month numbers: year × 12 + (month − 1).
  const origin = input.start.year * 12 + (input.start.month - 1);
  const calendar = (monthsFromStart: number) => {
    const absolute = origin + monthsFromStart;
    const year = (absolute - (absolute % 12)) / 12;
    return { year, month: (absolute % 12) + 1 };
  };
  const isBalanceEnd = (monthsFromStart: number) =>
    calendar(monthsFromStart - 1).month === input.balanceMonth;

  const constructionMonths = input.construction.periods * input.construction.periodMonths;
  const productionStart = constructionMonths;
  // Production ends on the productionYears-th balance date after it starts.
  let firstBalance = productionStart + 1;
  while (!isBalanceEnd(firstBalance)) firstBalance += 1;
  const productionEnd = firstBalance + 12 * (input.productionYears - 1);
  if (productionEnd > MAX_HORIZON_MONTHS) {
    throw new EngineInputError('horizon.tooLong', 'productionYears', {
      max: String(MAX_HORIZON_MONTHS),
    });
  }
  if (productionStart + startupMonths > productionEnd) {
    throw new EngineInputError('horizon.startupBeyondProduction', 'startup.periods');
  }

  const periods: HorizonPeriod[] = [];
  const push = (phase: PeriodPhase, startMonth: number, months: number) => {
    const endMonth = startMonth + months;
    periods.push({
      index: periods.length,
      phase,
      startMonth,
      months,
      endDay: endMonth * MONTH_DAYS,
      end: calendar(endMonth - 1),
      balanceDate: isBalanceEnd(endMonth),
    });
  };
  for (let i = 0; i < input.construction.periods; i++) {
    push('CONSTRUCTION', i * input.construction.periodMonths, input.construction.periodMonths);
  }
  let month = productionStart;
  for (let i = 0; i < input.startup.periods; i++) {
    push('STARTUP', month, input.startup.periodMonths);
    month += input.startup.periodMonths;
  }
  // Yearly periods after the start-up phase, each ending on the next balance date.
  while (month < productionEnd) {
    let end = month + 1;
    while (!isBalanceEnd(end)) end += 1;
    push('PRODUCTION', month, end - month);
    month = end;
  }

  const balanceYears: BalanceYear[] = [];
  for (let y = 0; y < input.productionYears; y++) {
    const endMonth = firstBalance + 12 * y;
    const period = periods.findIndex(
      (p) => p.startMonth < endMonth && p.startMonth + p.months >= endMonth,
    );
    balanceYears.push({
      year: y,
      months: y === 0 ? firstBalance - productionStart : 12,
      endMonth,
      endDay: endMonth * MONTH_DAYS,
      end: calendar(endMonth - 1),
      period,
    });
  }

  return {
    periods,
    productionStartMonth: productionStart,
    constructionEndDay: constructionMonths * MONTH_DAYS,
    balanceYears,
    totalMonths: productionEnd,
    salvage: { endDay: (productionEnd + 12) * MONTH_DAYS, end: calendar(productionEnd + 11) },
  };
}
