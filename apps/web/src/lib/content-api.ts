import 'server-only';
import type { ContentKind, PageSection } from '@roshd/validation';
import { serverGet } from './server-api';

export interface ContentCategory {
  id: string;
  slug: string;
  name: string;
}

export interface ContentSummary {
  id: string;
  kind: ContentKind;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
  tags: string[];
  isDemo: boolean;
  category: ContentCategory | null;
  author: { id: string; name: string; bio: string | null } | null;
}

export interface ContentDetail extends ContentSummary {
  body: string;
  references: { title: string; url?: string }[];
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  noIndex: boolean;
  ogImageUrl: string | null;
}

/** Route base per kind (API path segment === public route). */
export const KIND_ROUTE: Record<ContentKind, '/articles' | '/knowledge'> = {
  ARTICLE: '/articles',
  KNOWLEDGE: '/knowledge',
};

export function listContent(
  kind: ContentKind,
  params: { page?: number; pageSize?: number; category?: string; q?: string } = {},
) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.category) query.set('category', params.category);
  if (params.q) query.set('q', params.q);
  const qs = query.toString();
  return serverGet<ContentSummary[]>(`${KIND_ROUTE[kind]}${qs ? `?${qs}` : ''}`, {
    revalidate: 60,
    tags: ['content'],
  });
}

export function getContent(kind: ContentKind, slug: string) {
  return serverGet<ContentDetail>(`${KIND_ROUTE[kind]}/${encodeURIComponent(slug)}`, {
    revalidate: 300,
    tags: ['content'],
  });
}

export function listCategories(scope: ContentKind) {
  return serverGet<ContentCategory[]>(`/categories?scope=${scope}`, { revalidate: 300 });
}

export function sitemapContent() {
  return serverGet<{ kind: ContentKind; slug: string; updatedAt: string }[]>('/content/sitemap', {
    revalidate: 3600,
  });
}

export interface PublishedPage {
  slug: string;
  title: string;
  sections: PageSection[];
  metaTitle: string | null;
  metaDescription: string | null;
  noIndex: boolean;
  updatedAt: string;
}

/** A published institutional page (404 while it is only a draft or was never saved). */
export function getPage(slug: string) {
  return serverGet<PublishedPage>(`/pages/${encodeURIComponent(slug)}`, {
    revalidate: 300,
    tags: ['pages'],
  });
}
