import { SEARCH_TYPES, searchTokens, type SearchType } from '@roshd/validation';
import type { TextSearchResult } from '../../../common/search/search-text';
import type {
  SearchHit,
  SearchProvider,
  SearchQuery,
  SearchResults,
} from '../ports/search-provider';

/** One searchable collection, implemented by the module that owns it (no cross-module tables). */
export type SearchSource = (tokens: readonly string[], take: number) => Promise<TextSearchResult>;

/** Most results considered per collection; deeper pages are not useful for site search. */
const MAX_PER_SOURCE = 200;

/**
 * Federated PostgreSQL search: each module searches its own published records (every query
 * word must appear in the title or summary, ILIKE); results are merged by score, then recency.
 */
export class PostgresSearchProvider implements SearchProvider {
  readonly driver = 'postgres';

  constructor(private readonly sources: Record<SearchType, SearchSource>) {}

  async search(query: SearchQuery): Promise<SearchResults> {
    const tokens = searchTokens(query.q);
    const types = query.types?.length ? query.types : [...SEARCH_TYPES];
    const take = Math.min(query.page * query.pageSize, MAX_PER_SOURCE);
    const results = await Promise.all(
      types.map(async (type) => ({ type, result: await this.sources[type](tokens, take) })),
    );
    const merged: SearchHit[] = results
      .flatMap(({ type, result }) => result.hits.map((hit) => ({ ...hit, type })))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) ||
          a.id.localeCompare(b.id),
      );
    const start = (query.page - 1) * query.pageSize;
    return {
      hits: merged.slice(start, start + query.pageSize),
      total: results.reduce((sum, { result }) => sum + result.total, 0),
    };
  }
}
