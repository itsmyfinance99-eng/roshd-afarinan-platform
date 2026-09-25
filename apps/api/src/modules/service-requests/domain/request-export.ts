import {
  SERVICE_REQUEST_DETAIL_LABELS_FA,
  SERVICE_REQUEST_STATUS_LABELS_FA,
  SERVICE_REQUEST_TYPE_LABELS_FA,
  type ServiceRequestStatus,
  type ServiceRequestType,
} from '@roshd/validation';
import { excelText, raw, type CsvRaw } from '../../../common/csv/csv';

/** Iran Standard Time. Iran has observed no daylight saving time since 2022. */
const TEHRAN_OFFSET = '+03:30';
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

export const EXPORT_HEADER = [
  'کد پیگیری',
  'نوع',
  'وضعیت',
  'تاریخ ثبت',
  'نام و نام خانوادگی',
  'موبایل',
  'ایمیل',
  'موضوع',
  'جزئیات',
  'متن',
] as const;

export interface ExportableRequest {
  trackingCode: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  createdAt: Date;
  fullName: string;
  mobile: string;
  email: string | null;
  subject: string | null;
  message: string;
  details: unknown;
}

function detailsText(details: unknown): string {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return '';
  return Object.entries(details as Record<string, unknown>)
    .filter(([key, value]) => key !== 'topic' && typeof value === 'string' && value !== '')
    .map(([key, value]) => `${SERVICE_REQUEST_DETAIL_LABELS_FA[key] ?? key}: ${String(value)}`)
    .join('؛ ');
}

/** One CSV row. Free text is escaped by the CSV writer; the validated mobile keeps its leading 0. */
export function exportRow(r: ExportableRequest): CsvRaw[] {
  return [
    r.trackingCode,
    SERVICE_REQUEST_TYPE_LABELS_FA[r.type],
    SERVICE_REQUEST_STATUS_LABELS_FA[r.status],
    formatTehranDateTime(r.createdAt),
    r.fullName,
    /^\d+$/.test(r.mobile) ? raw(excelText(r.mobile)) : r.mobile,
    r.email,
    r.subject,
    detailsText(r.details),
    r.message,
  ];
}

/** ASCII file name (Content-Disposition safe): service-requests-20260926-1430.csv */
export function exportFileName(now: Date): string {
  const stamp = new Date(now.getTime() + 3.5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)
    .replace(/[-:]/g, '')
    .replace('T', '-');
  return `service-requests-${stamp}.csv`;
}
