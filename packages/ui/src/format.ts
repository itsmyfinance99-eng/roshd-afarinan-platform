const faNumber = new Intl.NumberFormat('fa-IR');

/** Formats numbers with Persian digits and grouping: 1250000 → ۱٬۲۵۰٬۰۰۰. */
export function formatNumber(value: number | bigint): string {
  return faNumber.format(value);
}

/** Formats a whole-rial digit string (money never travels as a JS number): "2500000" → ۲٬۵۰۰٬۰۰۰ ریال. */
export function formatRials(digits: string): string {
  return `${faNumber.format(BigInt(digits))} ریال`;
}

/** Replaces ASCII digits in a string with Persian digits: "01" → "۰۱". */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);
}

/** Persian step number for a zero-based index, without a leading zero (design v2): 0 → ۱. */
export function ordinal(index: number): string {
  return toPersianDigits(index + 1);
}

/** Formats an ISO date in the Persian (Jalali) calendar: ۱۴۰۵/۰۶/۲۰. */
export function formatDateFa(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Jalali date and time in Iran time: ۱۴۰۵/۰۶/۲۰، ۱۴:۳۰. */
export function formatDateTimeFa(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
