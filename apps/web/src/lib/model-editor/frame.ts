import { planHorizon, type HorizonInput } from '@roshd/financial-engine/horizon';
import { horizonSchema, toPersianDigits } from '@roshd/validation';
import { getIn, listAt, recordAt, setIn, type Draft, type Path } from './paths';

/**
 * The time frame of a model: the columns of every table of the editor. It follows the engine's
 * planning horizon (comfar-model-spec §1): project periods, project years (which end on balance
 * dates; inflation and escalation are yearly) and the financial years of production.
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

export interface Frame {
  periods: (Column & { phase: Phase; balanceDate: boolean })[];
  /** Years ending on balance dates, from the start of the horizon (the first may be partial). */
  projectYears: Column[];
  /** Financial years of production. */
  productionYears: Column[];
  totalMonths: number;
}

const monthLabel = (end: { year: number; month: number }) =>
  toPersianDigits(`${end.year}/${String(end.month).padStart(2, '0')}`);

/** The frame of the draft's horizon, or null while the horizon is incomplete or invalid. */
export function frameOf(draft: Draft): Frame | null {
  const parsed = horizonSchema.safeParse(draft.horizon);
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
    })),
    projectYears,
    productionYears: horizon.balanceYears.map((y) => ({
      label: monthLabel(y.end),
      group: `سال ${toPersianDigits(y.year + 1)} تولید`,
    })),
    totalMonths: horizon.totalMonths,
  };
}

/** A series of exactly `length` values: shortened, or padded with `pad`. */
export function fit(series: unknown, length: number, pad: string): string[] {
  const values = Array.isArray(series) ? series : [];
  return Array.from({ length }, (_, i) => {
    const value: unknown = values[i];
    return typeof value === 'string' ? value : pad;
  });
}

/**
 * Brings every series of the draft to the length of the frame after the horizon changed. Amounts
 * and quantities are padded with 0 (no flow in the new periods); rates and prices are left empty,
 * because the model has no defaults — the user is asked for them. Values of removed periods are
 * dropped.
 */
export function resizeDraft(draft: Draft, frame: Frame): Draft {
  const periods = frame.periods.length;
  const years = frame.projectYears.length;
  const production = frame.productionYears.length;
  let next = draft;
  const resize = (path: Path, length: number, pad: string, always = true) => {
    const value = getIn(next, path);
    if (Array.isArray(value) ? value.length !== length : always && value !== undefined) {
      next = setIn(next, path, fit(value, length, pad));
    }
  };
  /** One value or one per column: only an entered path is resized. */
  const optionalPath = (path: Path, length: number) => {
    if (Array.isArray(getIn(next, path))) resize(path, length, '');
  };
  const each = (path: Path, visit: (item: Path) => void) =>
    listAt(next, path).forEach((_, i) => visit([...path, i]));

  for (const currency of Object.keys(recordAt(next, ['exchangeRates']))) {
    resize(['exchangeRates', currency], periods, '');
  }
  for (const currency of Object.keys(recordAt(next, ['inflation']))) {
    resize(['inflation', currency], years, '');
  }
  each(['investment', 'items'], (item) => {
    resize([...item, 'amounts'], periods, '0');
    optionalPath([...item, 'escalation'], years);
  });
  each(['financing', 'equity'], (item) => resize([...item, 'amounts'], periods, '0'));
  each(['operations', 'products'], (product) =>
    each([...product, 'sales'], (line) => {
      resize([...line, 'quantities'], periods, '0', false);
      resize([...line, 'capacityShares'], periods, '0', false);
      for (const name of ['price', 'salesTaxRate', 'subsidyRate', 'subsidyAmount']) {
        optionalPath([...line, name], periods);
      }
      optionalPath([...line, 'escalation'], years);
    }),
  );
  each(['operations', 'costs'], (cost) => {
    for (const name of ['quantities', 'prices', 'variableShares']) {
      resize([...cost, 'adjustments', name], periods, '0', false);
    }
    optionalPath([...cost, 'escalation'], years);
  });
  const statements: Path = ['statements'];
  resize([...statements, 'allowances', 'investment'], periods, '0', false);
  resize([...statements, 'allowances', 'depreciation'], periods, '0', false);
  optionalPath([...statements, 'discounting', 'totalCapitalRate'], periods);
  optionalPath([...statements, 'discounting', 'equityRate'], periods);
  optionalPath([...statements, 'profitDistribution', 'retainedShare'], production);
  each([...statements, 'profitDistribution', 'shareholders'], (holder) => {
    for (const name of ['preferredRate', 'preferredAmount', 'ordinaryShare']) {
      optionalPath([...holder, name], production);
    }
  });
  each([...statements, 'tax', 'brackets'], (bracket) =>
    optionalPath([...bracket, 'rate'], production),
  );
  return next;
}
