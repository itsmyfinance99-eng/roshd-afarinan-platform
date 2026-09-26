import { describe, expect, it } from 'vitest';
import { searchQuerySchema, searchTokens } from './search';

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
});
