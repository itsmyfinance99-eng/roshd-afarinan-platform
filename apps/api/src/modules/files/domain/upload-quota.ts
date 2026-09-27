/**
 * Per-user limits on unattached uploads (ST-26.04, finding F-07).
 *
 * A file becomes "attached" when a business record (a request, a ticket) references it. Until
 * then nothing owns it, nothing deletes it, and one account could fill the disk: 10 × 8 MB in
 * 0.4 s during the audit. Attached files are not counted here; they belong to real records and
 * are covered by the business rules and the backup policy.
 */
export interface UploadQuota {
  maxBytes: number;
  maxFiles: number;
}

export interface QuotaUsage {
  bytes: number;
  files: number;
}

export type QuotaDecision =
  { allowed: true } | { allowed: false; reason: 'bytes' | 'files'; message: string };

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024)).toLocaleString('fa-IR');

/** Decides whether one more upload of `size` bytes fits within the quota. */
export function checkUploadQuota(
  usage: QuotaUsage,
  size: number,
  quota: UploadQuota,
): QuotaDecision {
  if (usage.files + 1 > quota.maxFiles) {
    return {
      allowed: false,
      reason: 'files',
      message: `تعداد فایل‌های بارگذاری‌شده و استفاده‌نشده شما به سقف ${quota.maxFiles.toLocaleString('fa-IR')} رسیده است. ابتدا چند فایل را حذف کنید یا در یک درخواست استفاده کنید.`,
    };
  }
  if (usage.bytes + size > quota.maxBytes) {
    return {
      allowed: false,
      reason: 'bytes',
      message: `حجم فایل‌های بارگذاری‌شده و استفاده‌نشده شما به سقف ${mb(quota.maxBytes)} مگابایت رسیده است. ابتدا چند فایل را حذف کنید یا در یک درخواست استفاده کنید.`,
    };
  }
  return { allowed: true };
}
