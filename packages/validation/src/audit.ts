import { z } from 'zod';
import {
  DAY_RANGE_ERROR,
  emailSchema,
  isoDaySchema,
  paginationQuerySchema,
  validDayRange,
} from './common';

/** Persian labels of known audit actions (unknown actions are shown as-is). */
export const AUDIT_ACTION_LABELS_FA: Record<string, string> = {
  'auth.register': 'ثبت‌نام',
  'auth.login_succeeded': 'ورود موفق',
  'auth.login_failed': 'ورود ناموفق',
  'auth.logout': 'خروج',
  'auth.refresh_reuse_detected': 'استفاده مجدد از توکن (مشکوک)',
  'users.roles_changed': 'تغییر نقش کاربر',
  'cms.entry_created': 'ایجاد محتوا',
  'cms.entry_updated': 'ویرایش محتوا',
  'cms.entry_published': 'انتشار محتوا',
  'cms.entry_archived': 'بایگانی محتوا',
  'cms.page_saved': 'ذخیره صفحه',
  'cms.page_published': 'انتشار صفحه',
  'file.uploaded': 'بارگذاری فایل',
  'file.deleted': 'حذف فایل',
  'service_request.created': 'ثبت درخواست',
  'service_request.status_changed': 'تغییر وضعیت درخواست',
  'service_requests.exported': 'خروجی گرفتن از درخواست‌ها',
  'ticket.created': 'ایجاد تیکت',
  'ticket.replied': 'پاسخ تیکت',
  'ticket.status_changed': 'تغییر وضعیت تیکت',
  'learning.course_created': 'ایجاد دوره',
  'learning.course_updated': 'ویرایش دوره',
  'learning.course_published': 'انتشار دوره',
  'learning.course_archived': 'بایگانی دوره',
  'research.project_created': 'ایجاد پژوهش',
  'research.project_updated': 'ویرایش پژوهش',
  'research.project_published': 'انتشار پژوهش',
  'research.project_archived': 'بایگانی پژوهش',
  'investment.opportunity_created': 'ایجاد طرح',
  'investment.opportunity_updated': 'ویرایش طرح',
  'investment.opportunity_published': 'انتشار طرح',
  'investment.opportunity_archived': 'بایگانی طرح',
};

/** Action groups for filtering (prefix match). */
export const AUDIT_ACTION_GROUPS = [
  { value: 'auth.', label: 'ورود و حساب' },
  { value: 'users.', label: 'کاربران و نقش‌ها' },
  { value: 'service_request', label: 'درخواست‌ها' },
  { value: 'ticket.', label: 'تیکت‌ها' },
  { value: 'file.', label: 'فایل‌ها' },
  { value: 'cms.', label: 'محتوا' },
  { value: 'learning.', label: 'دوره‌ها' },
  { value: 'research.', label: 'پژوهش' },
  { value: 'investment.', label: 'فرصت‌ها' },
] as const;

export const listAuditLogsQuerySchema = paginationQuerySchema
  .extend({
    /** Exact action or a prefix such as `auth.`. */
    action: z
      .string()
      .trim()
      .regex(/^[a-z_.]{1,80}$/, { error: 'عمل معتبر نیست.' })
      .optional(),
    /** Actor email (exact). */
    actor: emailSchema.optional(),
    entityType: z
      .string()
      .trim()
      .regex(/^[a-z_]{1,40}$/, { error: 'نوع موجودیت معتبر نیست.' })
      .optional(),
    entityId: z.string().trim().max(100).optional(),
    from: isoDaySchema.optional(),
    to: isoDaySchema.optional(),
  })
  .refine(validDayRange, { error: DAY_RANGE_ERROR, path: ['to'] });

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
