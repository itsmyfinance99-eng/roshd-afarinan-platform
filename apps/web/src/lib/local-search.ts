import { normalizePersianText } from '@roshd/validation';
import { consultingServices, journeys } from '@/content/site';

export interface LocalHit {
  title: string;
  type: string;
  href: string;
  isDemo: boolean;
}

/**
 * Search over the static content layer (journeys, services); API collections are searched
 * by the search page itself.
 * Matching is a normalised substring match (Arabic ي/ك folded to Persian).
 */
export function searchLocalContent(query: string, limit = 30): LocalHit[] {
  const q = normalizePersianText(query).toLowerCase();
  if (!q) return [];
  const match = (...fields: string[]) =>
    fields.some((f) => normalizePersianText(f).toLowerCase().includes(q));

  const hits: LocalHit[] = [
    ...journeys
      .filter((j) => match(j.title, j.description))
      .map((j) => ({ title: j.title, type: 'مسیر اصلی', href: j.href, isDemo: false })),
    ...consultingServices
      .filter((s) => match(s.title, s.description))
      .map((s) => ({ title: s.title, type: 'مشاوره', href: '/consulting', isDemo: false })),
  ];
  return hits.slice(0, limit);
}
