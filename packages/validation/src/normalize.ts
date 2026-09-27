const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII digits. */
export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const persian = PERSIAN_DIGITS.indexOf(ch);
    return String(persian >= 0 ? persian : ARABIC_DIGITS.indexOf(ch));
  });
}

/** Normalises Arabic yeh/kaf to their Persian forms so search and uniqueness behave. */
export function normalizePersianText(input: string): string {
  return input.replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
}

/**
 * Converts ASCII digits to Persian ones (۰-۹). User-facing messages that carry a number must
 * show Persian digits (CLAUDE.md), so it is applied where a limit is interpolated into copy.
 */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (ch) => PERSIAN_DIGITS[Number(ch)] ?? ch);
}
