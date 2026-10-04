import { planHorizon, type HorizonInput } from '@roshd/financial-engine/horizon';
import { horizonSchema, toPersianDigits } from '@roshd/validation';

/**
 * The time frame of a model: the columns of every table of the editor, the result pages and the
 * exports. It follows the engine's planning horizon (comfar-model-spec §1): project periods,
 * project years (which end on balance dates; inflation and escalation are yearly) and the
 * financial years of production.
 */

export type Phase = 'CONSTRUCTION' | 'STARTUP' | 'PRODUCTION';

export const PHASE_LABELS_FA: Record<Phase, string> = {
  CONSTRUCTION: 'ساخت',
  STARTUP: 'راه‌اندازی',
  PRODUCTION: 'تولید',
};

export interface Column {
  /** Calendar month of the last day, e.g. «۱۴۰۶/۱۲». */
  label: string;
  /** Phase of a period, or the kind of year. */
  group: string;
}

export interface FramePeriod extends Column {
  phase: Phase;
  balanceDate: boolean;
  months: number;
  /**
   * Months from the start of its part of the project to the first day of the period: from the
   * start of construction for a construction period, from the start of production otherwise.
   */
  from: number;
}

export interface Frame {
  periods: FramePeriod[];
  /** Years ending on balance dates, from the start of the horizon (the first may be partial). */
  projectYears: Column[];
  /** Financial years of production. */
  productionYears: Column[];
  totalMonths: number;
}

const monthLabel = (end: { year: number; month: number }) =>
  toPersianDigits(`${end.year}/${String(end.month).padStart(2, '0')}`);

/** The frame of a horizon, or null while it is incomplete or invalid. */
export function frameOfHorizon(value: unknown): Frame | null {
  const parsed = horizonSchema.safeParse(value);
  if (!parsed.success) return null;
  const input: HorizonInput = parsed.data;
  const horizon = planHorizon(input);
  // Project years as the engine counts them (`projectYears` in model/prices.ts).
  const first = (((horizon.balanceYears[0]?.endMonth ?? 12) - 1) % 12) + 1;
  const yearOf = (endMonth: number) => {
    const after = endMonth - first + 11;
    return after < 12 ? 0 : (after - (after % 12)) / 12;
  };
  const count = yearOf(horizon.totalMonths) + 1;
  const origin = input.start.year * 12 + (input.start.month - 1);
  const projectYears = Array.from({ length: count }, (_, j): Column => {
    const last = origin + first + 12 * j - 1;
    return {
      label: monthLabel({ year: (last - (last % 12)) / 12, month: (last % 12) + 1 }),
      group: `سال ${toPersianDigits(j + 1)} طرح`,
    };
  });
  return {
    periods: horizon.periods.map((p) => ({
      label: monthLabel(p.end),
      group: PHASE_LABELS_FA[p.phase],
      phase: p.phase,
      balanceDate: p.balanceDate,
      months: p.months,
      from: p.phase === 'CONSTRUCTION' ? p.startMonth : p.startMonth - horizon.productionStartMonth,
    })),
    projectYears,
    productionYears: horizon.balanceYears.map((y) => ({
      label: monthLabel(y.end),
      group: `سال ${toPersianDigits(y.year + 1)} تولید`,
    })),
    totalMonths: horizon.totalMonths,
  };
}
