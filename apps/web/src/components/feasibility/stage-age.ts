const DAY_MS = 24 * 60 * 60 * 1000;
const decimal = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });

/** Days as the staff read them; less than a day is said, not shown as zero. */
export const daysFa = (days: number): string =>
  days < 1 ? 'کمتر از یک روز' : `${decimal.format(days)} روز`;

/** How long a project has been in its status at `asOf`, in whole days. */
export const stageDays = (since: string, asOf: string): number =>
  Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(since)) / DAY_MS));
