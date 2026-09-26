import 'server-only';
import type { SearchType } from '@roshd/validation';
import { serverGet } from './server-api';

export interface SearchHit {
  type: SearchType;
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  isDemo: boolean;
  score: number;
}

export function searchSite(params: {
  q: string;
  type?: SearchType;
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams({ q: params.q });
  if (params.type) query.set('types', params.type);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  // Results change as content is published; a short cache keeps repeated queries cheap.
  return serverGet<SearchHit[]>(`/search?${query.toString()}`, {
    revalidate: 30,
    tags: ['search'],
  });
}
