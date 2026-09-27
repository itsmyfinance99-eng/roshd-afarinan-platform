/**
 * Solar Hijri (Jalali) ↔ Gregorian conversion.
 *
 * The product is Persian, so a date the user picks is a Jalali date, while the API speaks ISO
 * Gregorian days (ST-27.05). `Intl` can format Gregorian → Jalali but cannot parse the other
 * direction, which is why the arithmetic lives here. It is the standard algorithm based on the
 * 33-year leap cycle, and `jalali.test.ts` checks every day of a 40-year span against
 * `Intl.DateTimeFormat('fa-IR-u-ca-persian')`, so a mistake here cannot pass unnoticed.
 */

export interface JalaliDate {
  /** Solar Hijri year, e.g. 1405. */
  jy: number;
  /** Month, 1–12. */
  jm: number;
  /** Day of month, 1–31. */
  jd: number;
}

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 1701, 1749, 1770, 1797, 1858, 1889,
  1991, 2093, 2456, 3178,
];

interface CalendarShape {
  /** Gregorian year the Jalali year starts in. */
  gy: number;
  /** March day the Jalali year starts on. */
  march: number;
  /** Distance to the previous leap year (−1 … 4); 0 means this year is a leap year. */
  leap: number;
}

/** Leap-year layout of a Jalali year (33-year cycle with 29- and 37-year exceptions). */
function shape(jy: number): CalendarShape {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0] as number;
  if (jy < jp || jy >= (BREAKS[BREAKS.length - 1] as number)) {
    throw new RangeError(`Jalali year ${jy} is out of range`);
  }
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i += 1) {
    const jm = BREAKS[i] as number;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += Math.floor(jump / 33) * 8 + Math.floor((jump % 33) / 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += Math.floor(n / 33) * 8 + Math.floor(((n % 33) + 3) / 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
  const leapG = Math.floor(gy / 4) - Math.floor(((Math.floor(gy / 100) + 1) * 3) / 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + Math.floor((jump + 4) / 33) * 33;
  let leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;
  return { gy, march, leap };
}

export function isJalaliLeapYear(jy: number): boolean {
  return shape(jy).leap === 0;
}

/** Days in a Jalali month: 31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29 or 30. */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

/** Julian Day Number of a Gregorian date (no time component). */
function gregorianToJdn(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function jdnToGregorian(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export function toJalali(date: Date): JalaliDate {
  const jdn = gregorianToJdn(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return jdnToJalali(jdn);
}

/** Converts an ISO day (YYYY-MM-DD) to a Jalali date; the day is read as a calendar day. */
export function isoToJalali(iso: string): JalaliDate | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return null;
  const [gy, gm, gd] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  return jdnToJalali(gregorianToJdn(gy, gm, gd));
}

/** Converts a Jalali date to an ISO day (YYYY-MM-DD), which is what the API accepts. */
export function jalaliToIso({ jy, jm, jd }: JalaliDate): string {
  const { gy, gm, gd } = jdnToGregorian(jalaliToJdn(jy, jm, jd));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(gy).padStart(4, '0')}-${pad(gm)}-${pad(gd)}`;
}

function jalaliToJdn(jy: number, jm: number, jd: number): number {
  const { gy, march } = shape(jy);
  return gregorianToJdn(gy, 3, march) + (jm - 1) * 31 - Math.floor(jm / 7) * (jm - 7) + jd - 1;
}

function jdnToJalali(jdn: number): JalaliDate {
  const { gy } = jdnToGregorian(jdn);
  let jy = gy - 621;
  // `leap` belongs to this Jalali year and says how far the previous leap year is, so it has to
  // be read before stepping back into that year.
  const { march, leap } = shape(jy);
  const firstDay = gregorianToJdn(gy, 3, march);
  let k = jdn - firstDay;
  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + Math.floor(k / 31), jd: (k % 31) + 1 };
    }
    k -= 186;
  } else {
    // Before Nowruz: the day belongs to the second half of the previous Jalali year.
    jy -= 1;
    k += 179;
    if (leap === 1) k += 1;
  }
  return { jy, jm: 7 + Math.floor(k / 30), jd: (k % 30) + 1 };
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const pad2 = (n: number) => String(n).padStart(2, '0');
const fa = (value: string) => value.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);

/** ۱۴۰۵/۰۶/۲۰ — what the user reads and types. */
export function formatJalali({ jy, jm, jd }: JalaliDate): string {
  return fa(`${jy}/${pad2(jm)}/${pad2(jd)}`);
}

/** The same for an ISO day; an unparsable value comes back as an empty string. */
export function isoToJalaliText(iso: string): string {
  const jalali = isoToJalali(iso);
  return jalali ? formatJalali(jalali) : '';
}

const LATIN = (value: string) =>
  value.replace(/[۰-۹]/g, (ch) => String(PERSIAN_DIGITS.indexOf(ch)));

/**
 * Reads what the user typed (Persian or Latin digits, `/`، `-` or `.` as separator) and returns
 * the ISO day, or null when it is not a real Jalali date. A day of 31 in Esfand is not a date.
 */
export function jalaliTextToIso(text: string): string | null {
  const parts = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(LATIN(text).trim());
  if (!parts) return null;
  const jy = Number(parts[1]);
  const jm = Number(parts[2]);
  const jd = Number(parts[3]);
  if (jm < 1 || jm > 12 || jd < 1) return null;
  try {
    if (jd > jalaliMonthLength(jy, jm)) return null;
    return jalaliToIso({ jy, jm, jd });
  } catch {
    return null;
  }
}

export const JALALI_MONTHS_FA = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

/** Saturday-first weekday labels, matching an Iranian calendar. */
export const JALALI_WEEKDAYS_FA = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;

/** Weekday column (0 = Saturday) of the first day of a Jalali month. */
export function jalaliMonthStartColumn(jy: number, jm: number): number {
  const iso = jalaliToIso({ jy, jm, jd: 1 });
  const parts = iso.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0] as number, (parts[1] as number) - 1, parts[2]));
  // getUTCDay(): 0 = Sunday. Saturday must become 0, so shift by one.
  return (date.getUTCDay() + 1) % 7;
}

/** Adds months to a Jalali date, clamping the day to the target month's length. */
export function addJalaliMonths({ jy, jm, jd }: JalaliDate, months: number): JalaliDate {
  const absolute = jy * 12 + (jm - 1) + months;
  const year = Math.floor(absolute / 12);
  const month = (absolute % 12) + 1;
  return { jy: year, jm: month, jd: Math.min(jd, jalaliMonthLength(year, month)) };
}

/** Adds days to an ISO day and returns the new ISO day (used by keyboard navigation). */
export function addIsoDays(iso: string, days: number): string {
  const parts = iso.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0] as number, (parts[1] as number) - 1, parts[2]));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today as an ISO day in Iran time, so "today" does not shift with the viewer's clock. */
export function todayIsoInIran(now = new Date()): string {
  const tehran = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);
  return tehran.toISOString().slice(0, 10);
}
