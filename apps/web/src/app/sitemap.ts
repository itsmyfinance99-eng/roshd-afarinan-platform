import type { MetadataRoute } from 'next';
import { navigation } from '@/content/site';
import { KIND_ROUTE, sitemapContent } from '@/lib/content-api';
import { siteUrl } from '@/lib/env';
import { sitemapCourses } from '@/lib/learning-api';

/** Additional indexable routes that are not in the main navigation. */
const EXTRA_ROUTES = [
  '/services',
  '/feasibility/request',
  '/consulting/request',
  '/research/request',
];

/** Static routes + published, indexable CMS entries and courses (EPIC-20 · ST-20.01). */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = [...navigation.map((n) => n.href), ...EXTRA_ROUTES];
  const [content, courses] = await Promise.all([sitemapContent(), sitemapCourses()]);
  const dynamic: MetadataRoute.Sitemap = [
    ...(content.ok ? content.data : []).map((entry) => ({
      url: `${siteUrl}${KIND_ROUTE[entry.kind]}/${entry.slug}`,
      lastModified: entry.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...(courses.ok ? courses.data : []).map((course) => ({
      url: `${siteUrl}/training/${course.slug}`,
      lastModified: course.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
  const fixed: MetadataRoute.Sitemap = paths.map((path) => ({
    url: `${siteUrl}${path === '/' ? '' : path}`,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path.endsWith('/request') ? 0.5 : 0.7,
  }));
  return [...fixed, ...dynamic];
}
