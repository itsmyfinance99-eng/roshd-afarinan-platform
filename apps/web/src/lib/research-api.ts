import 'server-only';
import type { ContentCategory } from './content-api';
import { serverGet } from './server-api';

export interface ResearchSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  /** Solar Hijri year the study was completed. */
  year: number | null;
  publishedAt: string | null;
  updatedAt: string;
  isDemo: boolean;
  category: ContentCategory | null;
}

export interface ResearchDetail extends ResearchSummary {
  body: string;
  metaTitle: string | null;
  metaDescription: string | null;
  noIndex: boolean;
}

export function listResearch(
  params: { page?: number; pageSize?: number; category?: string; q?: string } = {},
) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.category) query.set('category', params.category);
  if (params.q) query.set('q', params.q);
  const qs = query.toString();
  return serverGet<ResearchSummary[]>(`/research${qs ? `?${qs}` : ''}`, {
    revalidate: 60,
    tags: ['research'],
  });
}

export function getResearch(slug: string) {
  return serverGet<ResearchDetail>(`/research/${encodeURIComponent(slug)}`, {
    revalidate: 300,
    tags: ['research'],
  });
}

export function listResearchCategories() {
  return serverGet<ContentCategory[]>('/categories?scope=RESEARCH', { revalidate: 300 });
}

export function sitemapResearch() {
  return serverGet<{ slug: string; updatedAt: string }[]>('/sitemap/research', {
    revalidate: 3600,
  });
}
