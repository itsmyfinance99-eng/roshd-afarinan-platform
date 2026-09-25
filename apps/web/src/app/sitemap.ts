import type { MetadataRoute } from 'next';
import { navigation } from '@/content/site';
import { siteUrl } from '@/lib/env';

/** Additional indexable routes that are not in the main navigation. */
const EXTRA_ROUTES = [
  '/services',
  '/feasibility/request',
  '/consulting/request',
  '/research/request',
];

/** Static routes now; published CMS entities are appended in EPIC-20 (ST-20.01). */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [...navigation.map((n) => n.href), ...EXTRA_ROUTES];
  return paths.map((path) => ({
    url: `${siteUrl}${path === '/' ? '' : path}`,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path.endsWith('/request') ? 0.5 : 0.7,
  }));
}
