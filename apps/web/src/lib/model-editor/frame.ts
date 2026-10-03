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

/** The frame of the horizon of a draft. */
export const frameOf = (draft: Draft): Frame | null => frameOfHorizon(draft.horizon);

/** A series of exactly `length` values: shortened, or padded with `pad`. */
export function fit(series: unknown, length: number, pad: string): string[] {
  const values = Array.isArray(series) ? series : [];
  return Array.from({ length }, (_, i) => {
    const value: unknown = values[i];
    return typeof value === 'string' ? value : pad;
  });
}

/** Construction periods are compared with construction periods, operating ones with operating. */
const part = (period: FramePeriod) => (period.phase === 'CONSTRUCTION' ? 'C' : 'O');
const spanKey = (p: FramePeriod) => `${part(p)}:${p.from}:${p.months}`;
const startKey = (p: FramePeriod) => `${part(p)}:${p.from}`;
const endKey = (p: FramePeriod) => `${part(p)}:${p.from + p.months}`;

/**
 * For every period of `next`, the period of `previous` whose values it keeps, or -1 for a new
 * one. A period keeps values only of a period that covers the same time: the same months counted
 * from the start of construction (construction periods) or from the start of production (start-up
 * and production periods). So a construction phase longer by whole years moves the whole
 * production programme with the start of production, while a start-up phase added in the first
 * year replaces that year — its quarters are new and the later years stay where they are. A
 * change that moves the start of production inside the financial year (half a year more of
 * construction, another start month) makes the first production year partial and every later
 * year begin at another time: no production period covers the same time, so none keeps values.
 */
export function periodMap(previous: Frame, next: Frame): number[] {
  const before = new Map(previous.periods.map((p, i) => [spanKey(p), i]));
  return next.periods.map((p) => before.get(spanKey(p)) ?? -1);
}

/** Number of periods of `previous` whose values `next` does not keep. */
export function droppedPeriods(previous: Frame, next: Frame): number {
  return previous.periods.length - periodMap(previous, next).filter((from) => from >= 0).length;
}

const sameSeries = (a: unknown, b: string[]) =>
  Array.isArray(a) && a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * Brings every series of the draft to the frame. Amounts and quantities of new periods are 0 (no
 * flow); rates and prices are left empty, because the model has no defaults — the user is asked
 * for them. Values of removed periods are dropped.
 *
 * With `previous` (the frame the values were entered for) they follow the periods that cover
 * the same time (`periodMap`), and the inputs that name a period move with its first or last day,
 * or are removed when no period begins or ends there any more. Series per project year and per
 * production year keep their order. Without it the series are only cut or padded at
 * the end — used for a stored draft whose lengths do not fit its own horizon.
 */
export function resizeDraft(draft: Draft, frame: Frame, previous?: Frame | null): Draft {
  const years = frame.projectYears.length;
  const production = frame.productionYears.length;
  const map = previous ? periodMap(previous, frame) : frame.periods.map((_, i) => i);
  let next = draft;
  const write = (path: Path, series: string[]) => {
    if (!sameSeries(getIn(next, path), series)) next = setIn(next, path, series);
  };
  /** A series per period; `always` also turns a value that is not a list into one. */
  const periodSeries = (path: Path, pad: string, always = true) => {
    const value = getIn(next, path);
    if (!Array.isArray(value) && !(always && value !== undefined)) return;
    const old = Array.isArray(value) ? (value as unknown[]) : [];
    write(
      path,
      map.map((from) => {
        const kept: unknown = from < 0 ? undefined : old[from];
        return typeof kept === 'string' ? kept : pad;
      }),
    );
  };
  const yearSeries = (path: Path, length: number, pad: string, always = true) => {
    const value = getIn(next, path);
    if (Array.isArray(value) || (always && value !== undefined)) {
      write(path, fit(value, length, pad));
    }
  };
  /** One value or one per column: only an entered path is resized. */
  const optionalPeriods = (path: Path) => periodSeries(path, '', false);
  const optionalYears = (path: Path, length: number) => yearSeries(path, length, '', false);
  const each = (path: Path, visit: (item: Path) => void) =>
    listAt(next, path).forEach((_, i) => visit([...path, i]));

  // Inputs that name a period follow its first day (a start) or its last day (an end) to the
  // period of the new frame that begins or ends at the same time; otherwise they are asked again.
  const starts = new Map(frame.periods.map((p, i) => [startKey(p), i]));
  const ends = new Map(frame.periods.map((p, i) => [endKey(p), i]));
  const periodIndex = (path: Path, edge: 'start' | 'end') => {
    const value = getIn(next, path);
    if (!previous || typeof value !== 'number') return;
    const old = previous.periods[value];
    const moved = old && (edge === 'start' ? starts.get(startKey(old)) : ends.get(endKey(old)));
    if (moved !== value) next = setIn(next, path, moved);
  };
  const productionYear = (path: Path) => {
    const value = getIn(next, path);
    if (typeof value === 'number' && value >= production) next = setIn(next, path, undefined);
  };

  for (const currency of Object.keys(recordAt(next, ['exchangeRates']))) {
    periodSeries(['exchangeRates', currency], '');
  }
  for (const currency of Object.keys(recordAt(next, ['inflation']))) {
    yearSeries(['inflation', currency], years, '');
  }
  each(['investment', 'items'], (item) => {
    periodSeries([...item, 'amounts'], '0');
    optionalYears([...item, 'escalation'], years);
    periodIndex([...item, 'depreciation', 'startPeriod'], 'start');
  });
  each(['financing', 'equity'], (item) => periodSeries([...item, 'amounts'], '0'));
  each(['financing', 'loans'], (loan) =>
    periodIndex([...loan, 'depreciation', 'startPeriod'], 'start'),
  );
  each(['operations', 'products'], (product) => {
    periodIndex([...product, 'production', 'firstPeriod'], 'start');
    periodIndex([...product, 'production', 'lastPeriod'], 'end');
    each([...product, 'sales'], (line) => {
      periodSeries([...line, 'quantities'], '0', false);
      periodSeries([...line, 'capacityShares'], '0', false);
      for (const name of ['price', 'salesTaxRate', 'subsidyRate', 'subsidyAmount']) {
        optionalPeriods([...line, name]);
      }
      optionalYears([...line, 'escalation'], years);
    });
  });
  each(['operations', 'costs'], (cost) => {
    for (const name of ['quantities', 'prices', 'variableShares']) {
      periodSeries([...cost, 'adjustments', name], '0', false);
    }
    optionalYears([...cost, 'escalation'], years);
  });
  const statements: Path = ['statements'];
  periodSeries([...statements, 'allowances', 'investment'], '0', false);
  periodSeries([...statements, 'allowances', 'depreciation'], '0', false);
  each([...statements, 'assetSales'], (sale) => periodIndex([...sale, 'period'], 'end'));
  optionalPeriods([...statements, 'discounting', 'totalCapitalRate']);
  optionalPeriods([...statements, 'discounting', 'equityRate']);
  optionalYears([...statements, 'profitDistribution', 'retainedShare'], production);
  each([...statements, 'profitDistribution', 'shareholders'], (holder) => {
    for (const name of ['preferredRate', 'preferredAmount', 'ordinaryShare']) {
      optionalYears([...holder, name], production);
    }
  });
  each([...statements, 'tax', 'brackets'], (bracket) =>
    optionalYears([...bracket, 'rate'], production),
  );
  productionYear([...statements, 'referenceYear']);
  productionYear([...statements, 'breakEvenYear']);
  return next;
}
