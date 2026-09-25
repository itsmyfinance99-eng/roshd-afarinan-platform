import { normalizePersianText } from '@roshd/validation';
import { demoProjects, demoResearch } from '@/content/demo';
import { consultingServices, journeys } from '@/content/site';

export interface LocalHit {
  title: string;
  type: string;
  href: string;
  isDemo: boolean;
}

/**
 * Interim search over the content layer until the SearchProvider API (EPIC-05) is live.
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
    ...demoProjects
      .filter((p) => match(p.title, p.sectorLabel, p.location))
      .map((p) => ({ title: p.title, type: 'پروژه', href: '/investment', isDemo: p.isDemo })),
    ...demoResearch
      .filter((r) => match(r.title, r.summary, r.category))
      .map((r) => ({ title: r.title, type: 'پژوهش', href: '/research', isDemo: r.isDemo })),
  ];
  return hits.slice(0, limit);
}
