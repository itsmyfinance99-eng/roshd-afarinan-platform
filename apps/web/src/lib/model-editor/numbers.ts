import { decimalStringSchema, toLatinDigits, toPersianDigits } from '@roshd/validation';

/**
 * Numbers of the model editor (ST-34.07). Values travel and are stored as decimal strings with
 * Latin digits and a dot ("1250000.5"); the user reads and types Persian digits, «٫» and «٬».
 * Everything here works on the text itself — no value ever becomes a JS number.
 */

const CANONICAL = /^(-?)(\d+)(?:\.(\d+))?$/;

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

/** Moves the decimal point: `places` to the right (positive) or to the left (negative). */
export function shiftDecimal(value: string, places: number): string {
  const match = CANONICAL.exec(value);
  if (!match) return value;
  let whole = match[2] ?? '0';
  let fraction = match[3] ?? '';
  if (places > 0) {
    fraction = fraction.padEnd(places, '0');
    whole += fraction.slice(0, places);
    fraction = fraction.slice(places);
  } else if (places < 0) {
    whole = whole.padStart(1 - places, '0');
    fraction = whole.slice(whole.length + places) + fraction;
    whole = whole.slice(0, whole.length + places);
  }
  whole = whole.replace(/^0+(?=\d)/, '');
  fraction = fraction.replace(/0+$/, '');
  const body = fraction === '' ? whole : `${whole}.${fraction}`;
  return match[1] === '-' && /[1-9]/.test(body) ? `-${body}` : body;
}

/** 0.18 → 18 (the editor shows rates and shares in percent; the model stores fractions). */
export const fractionToPercent = (value: string) => shiftDecimal(value, 2);
export const percentToFraction = (value: string) => shiftDecimal(value, -2);

/** Persian digits with «٬» between thousands and «٫» as the decimal point. */
export function formatDecimalFa(value: string, grouped = true): string {
  const match = CANONICAL.exec(value);
  if (!match) return value;
  const whole = match[2] ?? '0';
  const groups = grouped ? whole.replace(/\B(?=(\d{3})+$)/g, '٬') : whole;
  const fraction = match[3] === undefined ? '' : `٫${match[3]}`;
  return toPersianDigits(`${match[1] ?? ''}${groups}${fraction}`);
}

/** Rounds half away from zero to `digits` decimals, for display only. */
export function roundDecimal(value: string, digits: number): string {
  const match = CANONICAL.exec(value);
  if (!match) return value;
  const fraction = match[3] ?? '';
  if (fraction.length <= digits) return value;
  const scaled = BigInt(`${match[2] ?? '0'}${fraction.slice(0, digits + 1)}`);
  const rounded = ((scaled + 5n) / 10n).toString().padStart(digits + 1, '0');
  const whole = rounded.slice(0, rounded.length - digits);
  const rest = rounded.slice(rounded.length - digits).replace(/0+$/, '');
  const body = rest === '' ? whole : `${whole}.${rest}`;
  return match[1] === '-' && /[1-9]/.test(body) ? `-${body}` : body;
}

/** A whole number typed with Persian or Latin digits, or null. */
export function parseWhole(raw: string): number | null {
  const text = toLatinDigits(raw).trim();
  return /^-?\d{1,9}$/.test(text) ? Number(text) : null;
}
