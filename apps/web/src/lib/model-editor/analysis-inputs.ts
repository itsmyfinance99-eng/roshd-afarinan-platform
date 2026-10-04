import type { ProjectChange, ProjectInput, SensitivityVariable } from '@roshd/financial-engine';
import type { AnalysisOutcome, AnalysisRequest } from './analysis';
import type { AnalysisMessage, AnalysisResponse } from './calc.worker';
import { normalizeDecimal, percentToFraction } from './numbers';

/**
 * What the user chooses for a scenario or sensitivity analysis (ST-34.08), in the terms of
 * COMFAR's "global change of input data": the variables of a model and the percentages by which
 * they change. The percentages are always entered by the user — none is suggested.
 */

export type VariableKey =
  | 'salesPrice'
  | 'salesQuantity'
  | 'costPrice'
  | 'costQuantity'
  | 'investment'
  | 'exchangeRate'
  | 'inflation'
  | 'discountRate';

export const VARIABLE_LABELS_FA: Record<VariableKey, string> = {
  salesPrice: 'قیمت فروش',
  salesQuantity: 'مقدار فروش',
  costPrice: 'قیمت اقلام هزینه تولید',
  costQuantity: 'مقدار مصرف اقلام هزینه',
  investment: 'سرمایه‌گذاری ثابت',
  exchangeRate: 'نرخ ارز',
  inflation: 'نرخ تورم',
  discountRate: 'نرخ تنزیل',
};

const VARIABLES: Record<VariableKey, Omit<SensitivityVariable, 'key'>> = {
  salesPrice: { target: { kind: 'SALES' }, dimension: 'price' },
  salesQuantity: { target: { kind: 'SALES' }, dimension: 'quantity' },
  costPrice: { target: { kind: 'PRODUCTION_COSTS' }, dimension: 'price' },
  costQuantity: { target: { kind: 'PRODUCTION_COSTS' }, dimension: 'quantity' },
  investment: { target: { kind: 'FIXED_INVESTMENT' }, dimension: 'price' },
  exchangeRate: { target: { kind: 'EXCHANGE_RATE' }, dimension: 'price' },
  inflation: { target: { kind: 'INFLATION' }, dimension: 'price' },
  discountRate: { target: { kind: 'DISCOUNT_RATE' }, dimension: 'price' },
};

/** The variables that exist in this model (the engine refuses one that matches nothing). */
export function variablesOf(input: ProjectInput): VariableKey[] {
  const sales = input.operations.products.some((product) => product.sales.length > 0);
  const costs = input.operations.costs.length > 0;
  const fixed = input.investment.items.some((item) => item.group !== 'PRE_PRODUCTION');
  return [
    ...(sales ? (['salesPrice', 'salesQuantity'] as const) : []),
    ...(costs ? (['costPrice', 'costQuantity'] as const) : []),
    ...(fixed ? (['investment'] as const) : []),
    ...(Object.keys(input.exchangeRates).length > 0 ? (['exchangeRate'] as const) : []),
    ...(input.inflation !== undefined && Object.keys(input.inflation).length > 0
      ? (['inflation'] as const)
      : []),
    'discountRate',
  ];
}

export const sensitivityVariable = (key: VariableKey): SensitivityVariable => ({
  key,
  ...VARIABLES[key],
});

/** The change of one variable by a fraction ("-0.1"). */
export function changeOf(key: VariableKey, fraction: string): ProjectChange {
  const { target, dimension } = VARIABLES[key];
  return { target, [dimension]: fraction };
}

/**
 * Most model calculations one sensitivity analysis may ask for (variables × steps): each is a
 * full run of the model in the browser.
 */
export const MAX_ANALYSIS_RUNS = 48;

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

/** One percentage as typed («-۱۰», «12.5٪») as a canonical number, or null. */
const percentOf = (text: string): string | null => normalizeDecimal(text.replace(/[٪%]/g, ''));

/** One percentage as typed → a fraction, or null when it is not a number. */
export function percentAsFraction(text: string): string | null {
  const percent = percentOf(text);
  return percent === null ? null : percentToFraction(percent);
}

export const CHANGE_RANGE_FA = 'بیشتر از منفی ۱۰۰ و حداکثر ۱۰۰۰ درصد';

/**
 * A change (a step of the sensitivity analysis or a percentage of a scenario) is above −100 % —
 * at −100 % a price or rate is zero, which an exchange rate may not be and which says little for
 * the others — and at most +1000 % (beyond that it is a typing error). Compared as text: no
 * value becomes a number.
 */
export function changeInRange(text: string): boolean {
  const percent = percentOf(text);
  if (percent === null) return false;
  const [whole = '0', fraction = ''] = percent.replace('-', '').split('.');
  if (percent.startsWith('-')) return whole.length < 3;
  return whole.length < 4 || (whole === '1000' && /^0*$/.test(fraction));
}

/**
 * The steps of a sensitivity analysis as typed: percentages separated by spaces, commas or «،».
 * Zero is the base case itself and is not a step.
 */
export function parseSteps(text: string): Parsed<string[]> {
  const parts = text.split(/[\s,،;]+/).filter((part) => part !== '');
  if (parts.length === 0) {
    return { ok: false, message: 'دست‌کم یک درصد تغییر وارد کنید (مثلاً -۱۰ و ۱۰).' };
  }
  const steps: string[] = [];
  for (const part of parts) {
    const fraction = percentAsFraction(part);
    if (fraction === null) return { ok: false, message: `«${part}» عدد معتبری نیست.` };
    if (fraction === '0') {
      return { ok: false, message: 'صفر همان حالت پایه است؛ آن را از گام‌ها بردارید.' };
    }
    if (!changeInRange(part)) {
      return {
        ok: false,
        message: `«${part}» خارج از بازه است؛ هر گام باید ${CHANGE_RANGE_FA} باشد.`,
      };
    }
    if (steps.includes(fraction)) return { ok: false, message: `«${part}» دو بار آمده است.` };
    steps.push(fraction);
  }
  if (steps.length > 12) return { ok: false, message: 'حداکثر ۱۲ گام تغییر وارد کنید.' };
  return { ok: true, value: steps };
}

/**
 * Runs an analysis in a worker of its own and ends the worker with it. `signal` stops a
 * calculation the user no longer waits for.
 */
export function runAnalysis(
  analysis: AnalysisRequest,
  signal?: AbortSignal,
): Promise<AnalysisOutcome> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./calc.worker.ts', import.meta.url));
    } catch {
      resolve({ ok: false, message: 'محاسبه در این مرورگر در دسترس نیست.' });
      return;
    }
    const finish = (outcome: AnalysisOutcome) => {
      worker.terminate();
      resolve(outcome);
    };
    signal?.addEventListener('abort', () => finish({ ok: false, message: 'محاسبه متوقف شد.' }));
    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      const { id: _id, ...outcome } = event.data;
      finish(outcome as AnalysisOutcome);
    };
    worker.onerror = () => finish({ ok: false, message: 'محاسبه با خطا متوقف شد.' });
    worker.postMessage({ id: 1, analysis } satisfies AnalysisMessage);
  });
}
