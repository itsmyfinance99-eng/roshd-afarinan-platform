import type { Metadata } from 'next';
import { site } from '@/content/site';
import { siteUrl } from './env';

/** Page metadata with canonical URL and Open Graph (every public route uses this). */
export function pageMetadata({
  title,
  description,
  path,
  noIndex = false,
}: {
  title?: string;
  description?: string;
  path: string;
  noIndex?: boolean;
}): Metadata {
  const desc = description ?? site.description;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      locale: 'fa_IR',
      siteName: site.name,
      url: path,
      title: title ? `${title} | ${site.name}` : site.name,
      description: desc,
    },
    robots: noIndex ? { index: false, follow: true } : undefined,
  };
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: siteUrl,
    logo: `${siteUrl}/brand/logo.png`,
    foundingDate: '2009',
    description: site.description,
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  };
}

/** Serialises JSON-LD safely for a <script> tag (escapes `<` to prevent tag injection). */
export function jsonLdScript(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') };
}
