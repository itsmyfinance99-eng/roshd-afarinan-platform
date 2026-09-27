/** A published record matched by a module's text search (money and bodies are never included). */
export interface TextSearchHit {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date | null;
  isDemo: boolean;
  score: number;
}

export interface TextSearchResult {
  hits: TextSearchHit[];
  total: number;
}

type Contains = { contains: string; mode: 'insensitive' };

/**
 * Prisma passes `contains` to SQL LIKE without escaping, so `%` and `_` in user input act as
 * wildcards (`q=%` matched every row). Escapes them (and the escape character itself) with
 * PostgreSQL's default LIKE escape, the backslash.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Case-insensitive substring filter with user input taken literally. */
export function containsText(value: string): Contains {
  return { contains: escapeLike(value), mode: 'insensitive' };
}

/** `AND` conditions: every word appears in at least one of the fields (case-insensitive). */
export function textFilter<F extends string>(
  fields: readonly F[],
  tokens: readonly string[],
): { OR: Partial<Record<F, Contains>>[] }[] {
  return tokens.map((token) => ({
    OR: fields.map((field) => ({ [field]: containsText(token) }) as Partial<Record<F, Contains>>),
  }));
}

/**
 * Simple relevance: all words in the title 2, title starts with the first word +1,
 * all words in the excerpt +1.
 */
export function scoreText(
  tokens: readonly string[],
  title: string,
  excerpt: string | null,
): number {
  const t = title.toLowerCase();
  const e = (excerpt ?? '').toLowerCase();
  const words = tokens.map((w) => w.toLowerCase());
  const inTitle = words.every((w) => t.includes(w));
  const prefix = words[0] !== undefined && t.startsWith(words[0]);
  const inExcerpt = words.every((w) => e.includes(w));
  return (inTitle ? 2 : 0) + (prefix ? 1 : 0) + (inExcerpt ? 1 : 0);
}
