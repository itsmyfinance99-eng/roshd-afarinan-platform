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
