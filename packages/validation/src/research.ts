import { z } from 'zod';
import { CONTENT_STATUSES } from './cms';
import {
  MESSAGES,
  optionalText,
  paginationQuerySchema,
  slugSchema,
  text,
  urlOrPathSchema,
} from './common';

/** `/research/request` is a web route, so that slug is reserved. */
const researchSlug = slugSchema.refine((s) => s !== 'request', {
  error: 'این نامک رزرو شده است.',
});

const researchFields = z.object({
  slug: researchSlug,
  title: text(3, 200),
  summary: text(10, 500),
  body: z.string().trim().min(1, { error: MESSAGES.required }).max(100_000),
  coverImageUrl: urlOrPathSchema.nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  /** Solar Hijri year the study was completed. */
  year: z
    .number()
    .int()
    .min(1300, { error: 'سال باید به هجری شمسی باشد.' })
    .max(1500, { error: 'سال باید به هجری شمسی باشد.' })
    .nullable()
    .optional(),
  metaTitle: optionalText(70).nullable().optional(),
  metaDescription: optionalText(170).nullable().optional(),
  noIndex: z.boolean(),
});

export const createResearchSchema = researchFields.extend({
  noIndex: researchFields.shape.noIndex.default(false),
});

/** Partial update without defaults (omitted fields stay untouched). */
export const updateResearchSchema = researchFields.partial();

export const listPublishedResearchQuerySchema = paginationQuerySchema.extend({
  category: slugSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

export const listResearchAdminQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CONTENT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});

export type CreateResearchInput = z.infer<typeof createResearchSchema>;
export type UpdateResearchInput = z.infer<typeof updateResearchSchema>;
export type ListPublishedResearchQuery = z.infer<typeof listPublishedResearchQuerySchema>;
export type ListResearchAdminQuery = z.infer<typeof listResearchAdminQuerySchema>;
