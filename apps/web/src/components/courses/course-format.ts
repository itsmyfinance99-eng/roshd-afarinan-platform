import { formatNumber, formatRials } from '@roshd/ui';
import type { CourseSummary } from '@/lib/learning-api';

/** Price label; a paid course without a price is "price on request" (no invented prices). */
export function coursePriceLabel(course: Pick<CourseSummary, 'isFree' | 'priceRials'>): string {
  if (course.isFree) return 'رایگان';
  return course.priceRials ? formatRials(course.priceRials) : 'قیمت: استعلام';
}

export function courseDurationLabel(hours: number | null): string | null {
  return hours ? `${formatNumber(hours)} ساعت` : null;
}

/** Only same-origin covers are rendered (the CSP allows images from 'self' only). */
export function localCover(url: string | null): string | null {
  return url?.startsWith('/') ? url : null;
}
