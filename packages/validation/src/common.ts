import { z } from 'zod';
import { normalizePersianText, toLatinDigits } from './normalize';

export const MESSAGES = {
  required: 'این فیلد الزامی است.',
  invalidEmail: 'ایمیل معتبر نیست.',
  invalidMobile: 'شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.',
  tooShort: (min: number) => `حداقل ${min} نویسه وارد کنید.`,
  tooLong: (max: number) => `حداکثر ${max} نویسه مجاز است.`,
  invalidSlug: 'نامک فقط می‌تواند شامل حروف کوچک انگلیسی، عدد و خط تیره باشد.',
} as const;

/** Trimmed, Persian-normalised, non-empty text with a length range. */
export const text = (min = 1, max = 255) =>
  z
    .string({ error: MESSAGES.required })
    .transform(normalizePersianText)
    .pipe(
      z
        .string()
        .min(min, { error: min <= 1 ? MESSAGES.required : MESSAGES.tooShort(min) })
        .max(max, { error: MESSAGES.tooLong(max) }),
    );

/** Trimmed optional free text with a maximum length (empty string allowed). */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: MESSAGES.tooLong(max) });

export const httpUrlSchema = z.url({ protocol: /^https?$/, error: 'نشانی معتبر نیست.' }).max(500);

/** Absolute http(s) URL or a site-relative path starting with "/" (never protocol-relative). */
export const urlOrPathSchema = z.union([
  httpUrlSchema,
  z
    .string()
    .regex(/^\/[^/\\]/, { error: 'نشانی معتبر نیست.' })
    .max(500),
]);

export const emailSchema = z
  .string({ error: MESSAGES.required })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: MESSAGES.invalidEmail }).max(254));

/** Iranian mobile number; Persian/Arabic digits and +98 prefix are normalised to 09XXXXXXXXX. */
export const mobileSchema = z
  .string({ error: MESSAGES.required })
  .transform((v) =>
    toLatinDigits(v)
      .replace(/[\s-]/g, '')
      .replace(/^(\+98|0098|98)(?=9\d{9}$)/, '0'),
  )
  .pipe(z.string().regex(/^09\d{9}$/, { error: MESSAGES.invalidMobile }));

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: MESSAGES.invalidSlug });

export const idSchema = z.string().min(1).max(64);

/** Calendar day (YYYY-MM-DD, Gregorian as sent by date inputs); filters read it in Iran time. */
export const isoDaySchema = z.iso.date({ error: 'تاریخ معتبر نیست.' });

export const DAY_RANGE_ERROR = 'تاریخ شروع نباید بعد از تاریخ پایان باشد.';

/** Inclusive `from`/`to` day range check for refinements. */
export const validDayRange = (v: { from?: string; to?: string }) =>
  !v.from || !v.to || v.from <= v.to;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Staff assignment of a request or ticket; `null` removes the assignee. */
export const assignSchema = z.object({
  assigneeId: z.uuid({ error: 'کارشناس انتخاب‌شده معتبر نیست.' }).nullable(),
});
export type AssignInput = z.infer<typeof assignSchema>;

/** Staff list filter: `me` = assigned to the signed-in user, `none` = not assigned yet. */
export const ASSIGNEE_FILTERS = ['me', 'none'] as const;
export type AssigneeFilter = (typeof ASSIGNEE_FILTERS)[number];
export const assigneeFilterSchema = z.enum(ASSIGNEE_FILTERS);
