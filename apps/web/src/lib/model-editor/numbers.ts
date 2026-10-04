import { decimalStringSchema, toLatinDigits } from '@roshd/validation';

export {
  formatDecimalFa,
  fractionToPercent,
  percentToFraction,
  roundDecimal,
  shiftDecimal,
} from '@roshd/financial-report/numbers';

/**
 * Numbers of the model editor (ST-34.07). Values travel and are stored as decimal strings with
 * Latin digits and a dot ("1250000.5"); the user reads and types Persian digits, «٫» and «٬».
 * Everything here works on the text itself — no value ever becomes a JS number.
 */

/** The canonical form of what the user typed, or null when it is not a number. */
export function normalizeDecimal(raw: string): string | null {
  const parsed = decimalStringSchema.safeParse(raw);
  if (!parsed.success) return null;
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(parsed.data);
  if (!match) return null;
  const whole = (match[2] ?? '').replace(/^0+(?=\d)/, '') || '0';
  const fraction = match[3] ?? '';
  const body = fraction === '' ? whole : `${whole}.${fraction}`;
  return match[1] === '-' && /[1-9]/.test(body) ? `-${body}` : body;
}

/** A whole number typed with Persian or Latin digits, or null. */
export function parseWhole(raw: string): number | null {
  const text = toLatinDigits(raw).trim();
  return /^-?\d{1,9}$/.test(text) ? Number(text) : null;
}
