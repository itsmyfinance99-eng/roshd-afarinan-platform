import 'server-only';
import type { InvestmentSector, ProjectStage } from '@roshd/validation';
import { serverGet } from './server-api';

export interface InvestmentSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  sector: InvestmentSector;
  stage: ProjectStage;
  province: string | null;
  serviceNeeded: string | null;
  /** Whole rials as a digit string, only from approved project data. */
  estimatedInvestmentRials: string | null;
  publishedAt: string | null;
  updatedAt: string;
  isDemo: boolean;
}

export interface InvestmentDetail extends InvestmentSummary {
  description: string;
  metaTitle: string | null;
  metaDescription: string | null;
  noIndex: boolean;
}

export interface InvestmentFilters {
  page?: number;
  pageSize?: number;
  sector?: InvestmentSector;
  stage?: ProjectStage;
  q?: string;
}

export function listInvestments(filters: InvestmentFilters = {}) {
  const query = new URLSearchParams();
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));
  if (filters.sector) query.set('sector', filters.sector);
  if (filters.stage) query.set('stage', filters.stage);
  if (filters.q) query.set('q', filters.q);
  const qs = query.toString();
  return serverGet<InvestmentSummary[]>(`/investments${qs ? `?${qs}` : ''}`, {
    revalidate: 60,
    tags: ['investments'],
  });
}

export function getInvestment(slug: string) {
  return serverGet<InvestmentDetail>(`/investments/${encodeURIComponent(slug)}`, {
    revalidate: 300,
    tags: ['investments'],
  });
}

export function sitemapInvestments() {
  return serverGet<{ slug: string; updatedAt: string }[]>('/sitemap/investments', {
    revalidate: 3600,
  });
}
