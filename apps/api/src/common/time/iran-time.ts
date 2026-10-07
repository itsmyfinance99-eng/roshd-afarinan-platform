/** Iran Standard Time (UTC+03:30). Iran has observed no daylight saving time since 2022. */
export const TEHRAN_OFFSET = '+03:30';
export const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inclusive calendar days (YYYY-MM-DD) in Iran time → a half-open instant range. */
export function tehranDayRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00${TEHRAN_OFFSET}`) } : {}),
    ...(to ? { lt: new Date(new Date(`${to}T00:00:00${TEHRAN_OFFSET}`).getTime() + DAY_MS) } : {}),
  };
}

const jalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Jalali date-time in Iran time with Latin digits (sortable in spreadsheets): 1405/06/20 14:30. */
export function formatTehranDateTime(date: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    jalali.formatToParts(date).find((p) => p.type === type)?.value ?? '';
  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`;
}

/** The stamp of an export file name in Iran time (ASCII): 20260926-1430. */
export function tehranFileStamp(now: Date): string {
  return new Date(now.getTime() + TEHRAN_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
    .replace(/[-:]/g, '')
    .replace('T', '-');
}
