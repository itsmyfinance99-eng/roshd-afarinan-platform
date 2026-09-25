import type { MetadataRoute } from 'next';
import { navigation } from '@/content/site';
import { siteUrl } from '@/lib/env';

/** Static routes now; published CMS entities are appended in EPIC-20 (ST-20.01). */
export default function sitemap(): MetadataRoute.Sitemap {
  return navigation.map((item) => ({
    url: `${siteUrl}${item.href === '/' ? '' : item.href}`,
    changeFrequency: item.href === '/' ? 'weekly' : 'monthly',
    priority: item.href === '/' ? 1 : 0.7,
  }));
}
