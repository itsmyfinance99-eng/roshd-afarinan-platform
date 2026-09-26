import { z } from 'zod';
import {
  httpUrlSchema,
  MESSAGES,
  optionalText,
  paginationQuerySchema,
  slugSchema,
  text,
  urlOrPathSchema,
} from './common';

export const CONTENT_KINDS = ['ARTICLE', 'KNOWLEDGE'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CATEGORY_SCOPES = ['ARTICLE', 'KNOWLEDGE', 'RESEARCH', 'COURSE'] as const;
export type CategoryScope = (typeof CATEGORY_SCOPES)[number];

export const CONTENT_KIND_LABELS_FA: Record<ContentKind, string> = {
  ARTICLE: 'مقاله',
  KNOWLEDGE: 'مدخل دانشنامه',
};

export const CONTENT_STATUS_LABELS_FA: Record<ContentStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
  ARCHIVED: 'بایگانی',
};

const url = httpUrlSchema;
const urlOrPath = urlOrPathSchema;

export const referenceSchema = z.object({
  title: text(2, 300),
  url: url.optional(),
});

/** Editable fields of an article / knowledge entry, without defaults (shared by create and update). */
const contentEntryFields = z.object({
  kind: z.enum(CONTENT_KINDS),
  slug: slugSchema,
  title: text(3, 200),
  excerpt: optionalText(500).optional(),
  body: z.string().trim().min(1, { error: MESSAGES.required }).max(100_000),
  coverImageUrl: urlOrPath.nullable().optional(),
  authorId: z.uuid().nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  tags: z.array(text(1, 50)).max(20),
  references: z.array(referenceSchema).max(50),
  metaTitle: optionalText(70).nullable().optional(),
  metaDescription: optionalText(170).nullable().optional(),
  canonicalUrl: urlOrPath.nullable().optional(),
  noIndex: z.boolean(),
  ogImageUrl: urlOrPath.nullable().optional(),
});

export const createContentEntrySchema = contentEntryFields.extend({
  tags: contentEntryFields.shape.tags.default([]),
  references: contentEntryFields.shape.references.default([]),
  noIndex: contentEntryFields.shape.noIndex.default(false),
});
/**
 * Kind cannot change after creation; everything else is optional on update and
 * omitted fields are left untouched (no defaults here, so a PATCH never wipes tags etc.).
 */
export const updateContentEntrySchema = contentEntryFields.omit({ kind: true }).partial();

export type CreateContentEntryInput = z.infer<typeof createContentEntrySchema>;
export type UpdateContentEntryInput = z.infer<typeof updateContentEntrySchema>;

export const listPublishedContentQuerySchema = paginationQuerySchema.extend({
  category: slugSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

export const listContentAdminQuerySchema = paginationQuerySchema.extend({
  kind: z.enum(CONTENT_KINDS).optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});

export const createCategorySchema = z.object({
  scope: z.enum(CATEGORY_SCOPES),
  slug: slugSchema,
  name: text(2, 80),
});

export const listCategoriesQuerySchema = z.object({ scope: z.enum(CATEGORY_SCOPES) });

export const createAuthorSchema = z.object({
  name: text(2, 120),
  bio: optionalText(1000).optional(),
});

export const PAGE_SECTION_TYPES = ['intro', 'stats', 'list', 'richText'] as const;
export type PageSectionType = (typeof PAGE_SECTION_TYPES)[number];

export const PAGE_SECTION_LABELS_FA: Record<PageSectionType, string> = {
  intro: 'معرفی (عنوان و متن کوتاه)',
  stats: 'آمار',
  list: 'فهرست',
  richText: 'متن',
};

export const LIST_STYLES = ['numbered', 'chips', 'cards'] as const;
export type ListStyle = (typeof LIST_STYLES)[number];

export const LIST_STYLE_LABELS_FA: Record<ListStyle, string> = {
  numbered: 'شماره‌دار',
  chips: 'برچسب',
  cards: 'کارت',
};

/** Typed sections of an institutional page; the web renders each type with its own component. */
export const pageSectionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('intro'),
    title: text(2, 200),
    lead: optionalText(800).optional(),
  }),
  z.object({
    type: z.literal('stats'),
    items: z
      .array(
        z.object({
          value: text(1, 20),
          label: text(2, 80),
          detail: optionalText(240).optional(),
        }),
      )
      .min(1)
      .max(8),
  }),
  z.object({
    type: z.literal('list'),
    title: text(2, 120),
    style: z.enum(LIST_STYLES),
    items: z.array(text(1, 300)).min(1).max(50),
    note: optionalText(400).optional(),
  }),
  z.object({
    type: z.literal('richText'),
    title: text(2, 120).optional(),
    body: z.string().trim().min(1, { error: MESSAGES.required }).max(20_000),
  }),
]);

export type PageSection = z.infer<typeof pageSectionSchema>;

export const upsertPageSchema = z.object({
  title: text(2, 200),
  sections: z.array(pageSectionSchema).max(30).default([]),
  metaTitle: optionalText(70).nullable().optional(),
  metaDescription: optionalText(170).nullable().optional(),
  noIndex: z.boolean().default(false),
});

export type ListPublishedContentQuery = z.infer<typeof listPublishedContentQuerySchema>;
export type ListContentAdminQuery = z.infer<typeof listContentAdminQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateAuthorInput = z.infer<typeof createAuthorSchema>;
export type UpsertPageInput = z.infer<typeof upsertPageSchema>;
