import { describe, expect, it } from 'vitest';
import {
  addIsoDays,
  addJalaliMonths,
  formatJalali,
  isJalaliLeapYear,
  isoToJalali,
  isoToJalaliText,
  jalaliMonthLength,
  jalaliMonthStartColumn,
  jalaliTextToIso,
  jalaliToIso,
} from './jalali';

/** What the platform itself says a Gregorian day is in the Persian calendar. */
const intlJalali = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function intlParts(iso: string): { jy: number; jm: number; jd: number } {
  const [gy, gm, gd] = iso.split('-').map(Number);
  const formatted = intlJalali.formatToParts(
    new Date(Date.UTC(gy as number, (gm as number) - 1, gd)),
  );
  const get = (type: string) => Number(formatted.find((p) => p.type === type)?.value);
  return { jy: get('year'), jm: get('month'), jd: get('day') };
}

describe('Jalali conversion', () => {
  /**
   * The conversion is arithmetic, so a single wrong constant would only show up on some days of
   * some years. Every day of a 40-year span is checked against Intl in both directions
   * (ST-27.05) — about 14,600 days, which runs in well under a second.
   */
  it('agrees with Intl on every day from 2001 to 2041', () => {
    const start = Date.UTC(2001, 0, 1);
    const end = Date.UTC(2041, 0, 1);
    const mismatches: string[] = [];
    for (let t = start; t < end; t += 24 * 60 * 60 * 1000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      const ours = isoToJalali(iso);
      const theirs = intlParts(iso);
      if (ours?.jy !== theirs.jy || ours.jm !== theirs.jm || ours.jd !== theirs.jd) {
        mismatches.push(`${iso}: ours ${JSON.stringify(ours)} vs Intl ${JSON.stringify(theirs)}`);
        if (mismatches.length > 5) break;
      }
      // And back again: the Jalali date must return the day we started from.
      if (ours && jalaliToIso(ours) !== iso) {
        mismatches.push(`${iso}: round trip gave ${jalaliToIso(ours)}`);
        if (mismatches.length > 5) break;
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('converts the dates people quote', () => {
    expect(isoToJalaliText('2026-09-27')).toBe('۱۴۰۵/۰۷/۰۵');
    expect(jalaliTextToIso('۱۴۰۵/۰۷/۰۵')).toBe('2026-09-27');
    // Nowruz is always 1 Farvardin.
    expect(isoToJalali('2026-03-21')).toEqual({ jy: 1405, jm: 1, jd: 1 });
    expect(jalaliToIso({ jy: 1404, jm: 1, jd: 1 })).toBe('2025-03-21');
  });

  it('knows the length of every month, including Esfand in a leap year', () => {
    expect(jalaliMonthLength(1403, 1)).toBe(31);
    expect(jalaliMonthLength(1403, 7)).toBe(30);
    // 1403 is a leap year (Esfand has 30 days), 1404 is not.
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(isJalaliLeapYear(1404)).toBe(false);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(jalaliToIso({ jy: 1403, jm: 12, jd: 30 })).toBe('2025-03-20');
  });

  it('refuses text that is not a real Jalali date', () => {
    expect(jalaliTextToIso('۱۴۰۴/۱۲/۳۰')).toBeNull(); // Esfand 30 in a common year
    expect(jalaliTextToIso('۱۴۰۵/۱۳/۰۱')).toBeNull();
    expect(jalaliTextToIso('۱۴۰۵/۰۷/۰۰')).toBeNull();
    expect(jalaliTextToIso('۱۴۰۵/۰۱/۳۲')).toBeNull();
    expect(jalaliTextToIso('hello')).toBeNull();
    expect(isoToJalali('2026-13-01')).not.toBeNull(); // shape check only; see the sweep above
    expect(isoToJalali('not-a-date')).toBeNull();
  });

  it('accepts either digit set and either separator', () => {
    expect(jalaliTextToIso('1405/07/05')).toBe('2026-09-27');
    expect(jalaliTextToIso('۱۴۰۵-۷-۵')).toBe('2026-09-27');
    expect(jalaliTextToIso(' ۱۴۰۵.۰۷.۰۵ ')).toBe('2026-09-27');
  });

  it('formats with Persian digits and two-digit month and day', () => {
    expect(formatJalali({ jy: 1405, jm: 7, jd: 5 })).toBe('۱۴۰۵/۰۷/۰۵');
    expect(isoToJalaliText('')).toBe('');
  });

  it('moves by month and clamps the day', () => {
    expect(addJalaliMonths({ jy: 1405, jm: 12, jd: 5 }, 1)).toEqual({ jy: 1406, jm: 1, jd: 5 });
    expect(addJalaliMonths({ jy: 1405, jm: 1, jd: 5 }, -1)).toEqual({ jy: 1404, jm: 12, jd: 5 });
    // 31 Farvardin does not exist in Mehr (30 days) or in Esfand of a common year (29).
    expect(addJalaliMonths({ jy: 1405, jm: 1, jd: 31 }, 6)).toEqual({ jy: 1405, jm: 7, jd: 30 });
    expect(addJalaliMonths({ jy: 1404, jm: 1, jd: 31 }, 11)).toEqual({ jy: 1404, jm: 12, jd: 29 });
  });

  it('places the first of the month in the right weekday column', () => {
    // 1 Farvardin 1405 = 2026-03-21, a Saturday, so the first column.
    expect(jalaliMonthStartColumn(1405, 1)).toBe(0);
    // 1 Mehr 1405 = 2026-09-23, a Wednesday: Saturday-first column 4.
    expect(jalaliMonthStartColumn(1405, 7)).toBe(4);
  });

  it('steps by days across a month boundary', () => {
    expect(addIsoDays('2026-09-27', 1)).toBe('2026-09-28');
    expect(addIsoDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addIsoDays('2026-09-27', 7)).toBe('2026-10-04');
  });
});
