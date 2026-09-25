import type { MetadataRoute } from 'next';
import { navigation } from '@/content/site';
import { KIND_ROUTE, sitemapContent } from '@/lib/content-api';
import { siteUrl } from '@/lib/env';

/** Additional indexable routes that are not in the main navigation. */
const EXTRA_ROUTES = [
  '/services',
  '/feasibility/request',
  '/consulting/request',
  '/research/request',
];

/** Static routes + published, indexable CMS entries (EPIC-20 · ST-20.01). */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = [...navigation.map((n) => n.href), ...EXTRA_ROUTES];
  const content = await sitemapContent();
  const dynamic: MetadataRoute.Sitemap = (content.ok ? content.data : []).map((entry) => ({
    url: `${siteUrl}${KIND_ROUTE[entry.kind]}/${entry.slug}`,
    lastModified: entry.updatedAt,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));
  const fixed: MetadataRoute.Sitemap = paths.map((path) => ({
    url: `${siteUrl}${path === '/' ? '' : path}`,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path.endsWith('/request') ? 0.5 : 0.7,
  }));
  return [...fixed, ...dynamic];
}
