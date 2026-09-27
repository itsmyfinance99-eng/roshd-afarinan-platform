import type { PageSection } from '@roshd/validation';
import { activityAreas, credentials, expertise, pastWorkSectors, site, stats } from './site';

export interface DefaultPage {
  title: string;
  metaDescription: string;
  sections: PageSection[];
}

/**
 * Institutional pages editable in the CMS (ST-03.04). When a page has not been published yet,
 * the site renders these defaults (the reviewed content layer); the editor starts from them too.
 */
export const DEFAULT_PAGES = {
  about: {
    title: 'درباره ما',
    metaDescription: site.about,
    sections: [
      { type: 'intro', title: site.legalName, lead: site.about },
      {
        type: 'stats',
        items: stats.map((s) => ({ value: s.value, label: s.label, detail: s.detail })),
      },
      { type: 'list', title: 'حوزه‌های اصلی فعالیت', style: 'numbered', items: activityAreas },
      { type: 'list', title: 'تخصص‌های تیم', style: 'chips', items: expertise },
      {
        type: 'list',
        title: 'سوابق مطالعاتی و مشاوره‌ای',
        style: 'chips',
        items: pastWorkSectors,
        note: 'نمونه‌کارهای امکان‌سنجی و مشاوره شرکت در حوزه‌های بالا انجام شده است.',
      },
      {
        type: 'list',
        title: 'مجوزها و عضویت‌ها',
        style: 'cards',
        items: credentials,
        note: 'تصویر مدارک و جزئیات هر مجوز پس از دریافت نسخه رسمی و تأیید آن منتشر می‌شود.',
      },
    ],
  },
} satisfies Record<string, DefaultPage>;

export type EditablePageSlug = keyof typeof DEFAULT_PAGES;

export const EDITABLE_PAGES: { slug: EditablePageSlug; label: string; path: string }[] = [
  { slug: 'about', label: 'درباره ما', path: '/about' },
];
