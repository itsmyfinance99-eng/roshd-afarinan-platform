import 'server-only';
import type { CourseLevel, DeliveryMode } from '@roshd/validation';
import type { ContentCategory } from './content-api';
import { serverGet } from './server-api';

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  level: CourseLevel;
  deliveryMode: DeliveryMode;
  durationHours: number | null;
  isFree: boolean;
  /** Whole rials as a digit string; null on a paid course = price on request. */
  priceRials: string | null;
  startsAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  isDemo: boolean;
  category: ContentCategory | null;
  instructor: { id: string; name: string; title: string | null } | null;
}

export interface CourseDetail extends CourseSummary {
  description: string;
  metaTitle: string | null;
  metaDescription: string | null;
  noIndex: boolean;
  instructor: { id: string; name: string; title: string | null; bio: string | null } | null;
}

export interface CourseFilters {
  page?: number;
  pageSize?: number;
  category?: string;
  level?: CourseLevel;
  free?: boolean;
  q?: string;
}

export function listCourses(filters: CourseFilters = {}) {
  const query = new URLSearchParams();
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));
  if (filters.category) query.set('category', filters.category);
  if (filters.level) query.set('level', filters.level);
  if (filters.free) query.set('free', 'true');
  if (filters.q) query.set('q', filters.q);
  const qs = query.toString();
  return serverGet<CourseSummary[]>(`/courses${qs ? `?${qs}` : ''}`, {
    revalidate: 60,
    tags: ['courses'],
  });
}

export function getCourse(slug: string) {
  return serverGet<CourseDetail>(`/courses/${encodeURIComponent(slug)}`, {
    revalidate: 300,
    tags: ['courses'],
  });
}

export function listCourseCategories() {
  return serverGet<ContentCategory[]>('/categories?scope=COURSE', { revalidate: 300 });
}

/** Whether online payment is available (hides purchase buttons when it is not). */
export function getPaymentStatus() {
  return serverGet<{ enabled: boolean; testMode: boolean }>('/payments/status', {
    revalidate: 300,
  });
}

export function sitemapCourses() {
  return serverGet<{ slug: string; updatedAt: string }[]>('/sitemap/courses', {
    revalidate: 3600,
  });
}
