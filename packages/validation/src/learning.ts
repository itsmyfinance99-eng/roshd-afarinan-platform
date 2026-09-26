import { z } from 'zod';
import {
  MESSAGES,
  optionalText,
  paginationQuerySchema,
  slugSchema,
  text,
  urlOrPathSchema,
} from './common';
import { CONTENT_STATUSES } from './cms';
import { toLatinDigits } from './normalize';

export const COURSE_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

export const DELIVERY_MODES = ['ONLINE', 'IN_PERSON', 'HYBRID'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const COURSE_LEVEL_LABELS_FA: Record<CourseLevel, string> = {
  BEGINNER: 'مقدماتی',
  INTERMEDIATE: 'متوسط',
  ADVANCED: 'پیشرفته',
};

export const DELIVERY_MODE_LABELS_FA: Record<DeliveryMode, string> = {
  ONLINE: 'آنلاین',
  IN_PERSON: 'حضوری',
  HYBRID: 'ترکیبی',
};

export const PRICE_ERRORS = {
  invalid: 'مبلغ باید عددی صحیح به ریال باشد.',
  freeWithPrice: 'دوره رایگان نمی‌تواند مبلغ داشته باشد.',
} as const;

/** Whole rials as a digit string (money never travels as a JS number). Persian digits accepted. */
export const priceRialsSchema = z
  .string()
  .transform((v) => toLatinDigits(v).replace(/[\s,٬]/g, ''))
  .pipe(z.string().regex(/^(0|[1-9]\d{0,14})$/, { error: PRICE_ERRORS.invalid }));

const courseFields = z.object({
  slug: slugSchema,
  title: text(3, 200),
  summary: text(10, 500),
  description: z.string().trim().min(1, { error: MESSAGES.required }).max(50_000),
  coverImageUrl: urlOrPathSchema.nullable().optional(),
  categoryId: z.uuid({ error: 'شناسه انتخاب‌شده معتبر نیست.' }).nullable().optional(),
  instructorId: z.uuid({ error: 'شناسه انتخاب‌شده معتبر نیست.' }).nullable().optional(),
  level: z.enum(COURSE_LEVELS),
  deliveryMode: z.enum(DELIVERY_MODES),
  durationHours: z.number().int().min(1).max(2000).nullable().optional(),
  isFree: z.boolean(),
  /** Null on a paid course means "price on request". */
  priceRials: priceRialsSchema.nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  metaTitle: optionalText(70).nullable().optional(),
  metaDescription: optionalText(170).nullable().optional(),
  noIndex: z.boolean(),
});

export const createCourseSchema = courseFields
  .extend({
    isFree: courseFields.shape.isFree.default(false),
    noIndex: courseFields.shape.noIndex.default(false),
  })
  .superRefine((value, ctx) => {
    if (value.isFree && value.priceRials) {
      ctx.addIssue({ code: 'custom', path: ['priceRials'], message: PRICE_ERRORS.freeWithPrice });
    }
  });

/** Partial update without defaults; the free/price rule is checked against the merged record. */
export const updateCourseSchema = courseFields.partial();

export const listPublishedCoursesQuerySchema = paginationQuerySchema.extend({
  category: slugSchema.optional(),
  level: z.enum(COURSE_LEVELS).optional(),
  free: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(100).optional(),
});

export const listCoursesAdminQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CONTENT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});

export const createInstructorSchema = z.object({
  name: text(2, 120),
  title: optionalText(120).nullable().optional(),
  bio: optionalText(2000).nullable().optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type ListPublishedCoursesQuery = z.infer<typeof listPublishedCoursesQuerySchema>;
export type ListCoursesAdminQuery = z.infer<typeof listCoursesAdminQuerySchema>;
export type CreateInstructorInput = z.infer<typeof createInstructorSchema>;
