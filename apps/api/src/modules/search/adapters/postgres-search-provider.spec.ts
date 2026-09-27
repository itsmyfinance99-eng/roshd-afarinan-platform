import { describe, expect, it, vi } from 'vitest';
import type { TextSearchResult } from '../../../common/search/search-text';
import { PostgresSearchProvider, type SearchSource } from './postgres-search-provider';

const hit = (id: string, score: number, day: number) => ({
  id,
  slug: id,
  title: id,
  excerpt: null,
  publishedAt: new Date(Date.UTC(2026, 8, day)),
  isDemo: false,
  score,
});

const source = (result: TextSearchResult) => vi.fn<SearchSource>().mockResolvedValue(result);

describe('PostgresSearchProvider', () => {
  const sources = {
    article: source({ hits: [hit('a1', 2, 10), hit('a2', 3, 1)], total: 2 }),
    knowledge: source({ hits: [hit('k1', 2, 20)], total: 1 }),
    course: source({ hits: [], total: 0 }),
    research: source({ hits: [hit('r1', 1, 25)], total: 5 }),
    investment: source({ hits: [], total: 0 }),
  };
  const provider = new PostgresSearchProvider(sources);

  it('merges by score, then recency, with typed hits and summed totals', async () => {
    const res = await provider.search({ q: 'امکان سنجی', page: 1, pageSize: 3 });
    expect(res.hits.map((h) => `${h.type}:${h.id}`)).toEqual([
      'article:a2',
      'knowledge:k1',
      'article:a1',
    ]);
    expect(res.total).toBe(8);
    expect(sources.article).toHaveBeenCalledWith(['امکان', 'سنجی'], 3);
  });

  it('queries only the requested types and pages the merged list', async () => {
    sources.course.mockClear();
    const res = await provider.search({ q: 'طرح', types: ['research'], page: 1, pageSize: 10 });
    expect(res.hits.map((h) => h.type)).toEqual(['research']);
    expect(sources.course).not.toHaveBeenCalled();
    const second = await provider.search({ q: 'طرح', page: 2, pageSize: 2 });
    expect(second.hits.map((h) => h.id)).toEqual(['a1', 'r1']);
  });
});
