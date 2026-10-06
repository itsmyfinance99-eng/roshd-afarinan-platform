import { toPersianDigits } from '@roshd/validation';

/**
 * Numbers of a financial model as text. Values travel and are stored as decimal strings with
 * Latin digits and a dot ("1250000.5"); the user reads Persian digits, «٫» and «٬». Everything
 * here works on the text itself — no value ever becomes a JS number.
 */

const CANONICAL = /^(-?)(\d+)(?:\.(\d+))?$/;

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

/** 0.18 → 18 (rates and shares are shown in percent; the model stores fractions). */
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

/**
 * Rounds for display so that a small ratio keeps its leading digits: two decimals for a number of
 * one or more, three significant digits below that.
 */
export function roundSignificant(value: string): string {
  const match = CANONICAL.exec(value);
  if (!match) return value;
  if (/[1-9]/.test(match[2] ?? '')) return roundDecimal(value, 2);
  const zeros = /^0*/.exec(match[3] ?? '')?.[0].length ?? 0;
  return roundDecimal(value, zeros + 3);
}
