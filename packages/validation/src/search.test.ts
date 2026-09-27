import { describe, expect, it } from 'vitest';
import { SEARCH_TYPES, searchQuerySchema, searchTokens } from './search';

describe('search', () => {
  it('splits on spaces and ZWNJ so both spellings give the same words', () => {
    expect(searchTokens('امکان سنجی')).toEqual(['امکان', 'سنجی']);
    expect(searchTokens('امکان‌سنجی')).toEqual(['امکان', 'سنجی']);
    expect(searchTokens('  كيفيت   كيفيت ')).toEqual(['کیفیت']);
    expect(searchTokens('a b c d e f g h i j')).toHaveLength(8);
  });

  it('validates the query, types and paging', () => {
    expect(searchQuerySchema.parse({ q: ' طرح ', types: 'course,research' })).toMatchObject({
      q: 'طرح',
      types: ['course', 'research'],
      page: 1,
      pageSize: 20,
    });
    expect(searchQuerySchema.safeParse({ q: 'ا' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'طرح', types: 'users' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'طرح', pageSize: '500' }).success).toBe(false);
  });

  it('bounds and de-duplicates types so one request cannot multiply the queries', () => {
    // ST-26.01: each type costs one database query.
    expect(searchQuerySchema.parse({ q: 'طرح', types: 'course,course,course' }).types).toEqual([
      'course',
    ]);
    expect(searchQuerySchema.parse({ q: 'طرح', types: SEARCH_TYPES.join(',') }).types).toEqual([
      ...SEARCH_TYPES,
    ]);
    const flood = Array.from({ length: 1500 }, () => 'article').join(',');
    expect(searchQuerySchema.safeParse({ q: 'طرح', types: flood }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'طرح', types: 'course,,course' }).success).toBe(false);
  });
});
