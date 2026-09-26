import { z } from 'zod';
import { normalizePersianText } from './normalize';

export const SEARCH_TYPES = ['article', 'knowledge', 'course', 'research', 'investment'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const SEARCH_TYPE_LABELS_FA: Record<SearchType, string> = {
  article: 'مقاله',
  knowledge: 'دانشنامه',
  course: 'دوره',
  research: 'پژوهش',
  investment: 'طرح',
};

/** Public route of each result type. */
export const SEARCH_TYPE_ROUTES: Record<SearchType, string> = {
  article: '/articles',
  knowledge: '/knowledge',
  course: '/training',
  research: '/research',
  investment: '/investment',
};

/** Most words of a query taken into account. */
const MAX_TOKENS = 8;

/**
 * Words of a query. Splitting on spaces and ZWNJ (U+200C) makes "امکان سنجی" and "امکان‌سنجی"
 * equivalent; every word must then appear in the record. Arabic yeh/kaf are folded to Persian.
 */
export function searchTokens(query: string): string[] {
  return [
    ...new Set(
      normalizePersianText(query)
        .split(/[\s‌]+/u)
        .filter((t) => t.length > 0),
    ),
  ].slice(0, MAX_TOKENS);
}

export const searchQuerySchema = z.object({
  q: z
    .string()
    .transform(normalizePersianText)
    .pipe(
      z
        .string()
        .min(2, { error: 'دست‌کم ۲ نویسه برای جستجو وارد کنید.' })
        .max(100, { error: 'حداکثر ۱۰۰ نویسه مجاز است.' }),
    ),
  /** Comma-separated result types, e.g. `course,research`. */
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((t) => t.trim()) : undefined))
    .pipe(z.array(z.enum(SEARCH_TYPES)).min(1).optional()),
  page: z.coerce.number().int().min(1).max(20).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
