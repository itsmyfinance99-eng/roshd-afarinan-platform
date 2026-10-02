import DecimalJs from 'decimal.js';

/**
 * The engine's only numeric type (ADR-0009): 34 significant digits, half-even rounding for the
 * few operations that must round internally (division, roots). Values cross every boundary as
 * decimal strings; rounding to a display scale happens only in `toDecimalString`.
 */
export const Decimal = DecimalJs.clone({
  precision: 34,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 60,
});
export type Decimal = InstanceType<typeof Decimal>;

/** A decimal number serialised as a string, e.g. "12500000" or "-0.035". */
export type DecimalString = string;

/** Plain decimal notation only: optional sign, digits, optional fraction. No exponent, no separators. */
const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

export class InvalidDecimalError extends Error {
  constructor(readonly input: unknown) {
    super(`Not a decimal string: ${JSON.stringify(input)}`);
    this.name = 'InvalidDecimalError';
  }
}

/**
 * Parses a decimal string. JavaScript numbers are refused on purpose: by the time a value is a
 * `number` it may already have lost precision (e.g. large rial amounts or 0.1 + 0.2).
 */
export function toDecimal(value: DecimalString | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value !== 'string') throw new InvalidDecimalError(value);
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) throw new InvalidDecimalError(value);
  return new Decimal(trimmed);
}

export function isDecimalString(value: unknown): value is DecimalString {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value.trim());
}

/**
 * Serialises without exponent notation. With `scale`, rounds half-even to that many fraction
 * digits (display only); without it, keeps every significant digit.
 */
export function toDecimalString(value: Decimal, scale?: number): DecimalString {
  const text =
    scale === undefined
      ? value.toFixed()
      : value.toDecimalPlaces(scale, Decimal.ROUND_HALF_EVEN).toFixed(scale);
  return text === '-0' || /^-0\.0*$/.test(text) ? text.slice(1) : text;
}

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);
