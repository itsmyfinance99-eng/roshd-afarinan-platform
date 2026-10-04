import { engineMessageFa } from '@roshd/financial-engine/messages';
import { ENGINE_DEFAULT_LABELS_FA } from '@roshd/validation';

/**
 * Persian texts of what the engine reports with a result (ST-34.07, ST-34.08): warnings, and the
 * COMFAR conventions it applied because the input leaves them open. Only the message table of the
 * engine is needed here, so that pages which show a stored run do not load the engine itself.
 */

export interface Warning {
  code: string;
  params?: Record<string, string>;
}

export interface DefaultUsed {
  key: string;
  value: string;
  item?: string;
}

export type Basis = 'totalCapital' | 'equity';

export const BASIS_LABELS_FA: Record<Basis, string> = {
  totalCapital: 'کل سرمایه',
  equity: 'آورده',
};

const isBasis = (value: string | undefined): value is Basis =>
  value !== undefined && Object.hasOwn(BASIS_LABELS_FA, value);

/** The indicator a warning is about, when it is about one. */
export type IndicatorKey = 'irr' | 'mirr' | 'payback' | 'dynamicPayback' | 'npvRatio';

const INDICATOR_OF_CODE: Record<string, IndicatorKey> = {
  irr: 'irr',
  mirr: 'mirr',
  payback: 'payback',
  dynamicPayback: 'dynamicPayback',
  npvr: 'npvRatio',
};

export const warningMessage = (warning: Warning): string =>
  engineMessageFa(warning.code, warning.params);

/** The message of a warning, with the basis it belongs to in front when it has one. */
export function warningText(warning: Warning): string {
  const text = warningMessage(warning);
  const basis = warning.params?.basis;
  return isBasis(basis) ? `${BASIS_LABELS_FA[basis]}: ${text}` : text;
}

/** The indicator a warning is about, whatever cash flow it belongs to. */
export function indicatorOfWarning(warning: Warning): IndicatorKey | null {
  const family = warning.code.split('.')[0] ?? '';
  return Object.hasOwn(INDICATOR_OF_CODE, family) ? (INDICATOR_OF_CODE[family] ?? null) : null;
}

/** Where a warning is shown: next to an indicator of a basis, or with the general ones. */
export function warningPlace(warning: Warning): { basis: Basis; indicator: IndicatorKey } | null {
  const basis = warning.params?.basis;
  const indicator = indicatorOfWarning(warning);
  return !isBasis(basis) || indicator === null ? null : { basis, indicator };
}

export function defaultText(used: DefaultUsed): string {
  const label = Object.hasOwn(ENGINE_DEFAULT_LABELS_FA, used.key)
    ? (ENGINE_DEFAULT_LABELS_FA[used.key] ?? used.key)
    : used.key;
  if (used.item === undefined) return label;
  // The item is a basis of the discounted cash flows or the name of an input (a loan, which may
  // be named anything, also «equity»: only the conventions of the flows have a basis).
  const basis = used.key !== 'loan.firstRepaymentDate' && isBasis(used.item);
  return `${label} (${basis ? BASIS_LABELS_FA[used.item as Basis] : `«${used.item}»`})`;
}

/** Texts without repeats, in their first order. */
export const unique = (texts: string[]): string[] => [...new Set(texts)];
