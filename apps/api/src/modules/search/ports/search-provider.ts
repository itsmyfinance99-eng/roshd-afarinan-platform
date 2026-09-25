/**
 * Port for site search (EPIC-05). Phase 1 implements it on PostgreSQL; an OpenSearch/Elastic
 * adapter can replace it without touching UI or business logic.
 * Only published, publicly visible documents may ever be returned.
 */
export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');

export const SEARCHABLE_TYPES = [
  'article',
  'knowledge',
  'course',
  'research',
  'investment',
] as const;
export type SearchableType = (typeof SEARCHABLE_TYPES)[number];

export interface SearchQuery {
  q: string;
  types?: SearchableType[];
  page: number;
  pageSize: number;
}

export interface SearchHit {
  type: SearchableType;
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  /** Relevance score; higher is better. Provider-specific scale. */
  score: number;
}

export interface SearchResults {
  hits: SearchHit[];
  total: number;
}

export interface SearchProvider {
  readonly driver: string;
  search(query: SearchQuery): Promise<SearchResults>;
}
