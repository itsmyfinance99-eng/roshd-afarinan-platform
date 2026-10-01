import { DemoBadge, formatDateFa, sectionLinkClasses } from '@roshd/ui';
import type { ContentKind } from '@roshd/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageIntro } from '@/components/layout/page-shell';
import { ReadingProgress } from '@/components/motion/reading-progress';
import { site } from '@/content/site';
import { getContent, KIND_ROUTE, type ContentDetail } from '@/lib/content-api';
import { siteUrl } from '@/lib/env';
import { jsonLdScript } from '@/lib/seo';
import { CONTENT_COPY } from './content-listing';
import { MarkdownBody } from './markdown';

export { ContentListingPage } from './content-listing';

export async function contentMetadata(kind: ContentKind, slug: string): Promise<Metadata> {
  const result = await getContent(kind, slug);
  // Resolve 404 before any streaming starts so crawlers get a real 404 status.
  if (!result.ok && result.status === 404) notFound();
  if (!result.ok) return { title: CONTENT_COPY[kind].crumb, robots: { index: false } };
  const entry = result.data;
  const path = `${KIND_ROUTE[kind]}/${entry.slug}`;
  const title = entry.metaTitle ?? entry.title;
  const description = entry.metaDescription ?? entry.excerpt ?? undefined;
  const image = entry.ogImageUrl ?? entry.coverImageUrl ?? undefined;
  return {
    title,
    description,
    alternates: { canonical: entry.canonicalUrl ?? path },
    robots: entry.noIndex || entry.isDemo ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'article',
      locale: 'fa_IR',
      siteName: site.name,
      url: path,
      title,
      description,
      publishedTime: entry.publishedAt ?? undefined,
      modifiedTime: entry.updatedAt,
      images: image ? [image] : undefined,
    },
  };
}

function articleJsonLd(kind: ContentKind, entry: ContentDetail) {
  const url = `${siteUrl}${KIND_ROUTE[kind]}/${entry.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': kind === 'ARTICLE' ? 'Article' : 'DefinedTerm',
    ...(kind === 'ARTICLE'
      ? {
          headline: entry.title,
          datePublished: entry.publishedAt ?? undefined,
          dateModified: entry.updatedAt,
          author: entry.author ? { '@type': 'Person', name: entry.author.name } : undefined,
          publisher: {
            '@type': 'Organization',
            name: site.name,
            logo: `${siteUrl}/brand/logo.png`,
          },
          mainEntityOfPage: url,
        }
      : { name: entry.title, description: entry.excerpt ?? undefined, url }),
    inLanguage: 'fa-IR',
  };
}

/** Article / knowledge entry: dark hero, then the text on a paper reading surface. */
export async function ContentDetailPage({ kind, slug }: { kind: ContentKind; slug: string }) {
  const result = await getContent(kind, slug);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error('Content service unavailable');
  }
  const entry = result.data;
  const base = KIND_ROUTE[kind];
  const copy = CONTENT_COPY[kind];
  const path = `${base}/${entry.slug}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(articleJsonLd(kind, entry))}
      />
      <ReadingProgress />
      <PageIntro
        path={path}
        crumb={entry.title}
        parent={{ label: copy.crumb, href: base }}
        eyebrow={entry.category?.name ?? copy.crumb}
        title={entry.title}
        lead={entry.excerpt ?? undefined}
      />
      <div data-surface="paper" className="border-b border-paper-line">
        <article className="mx-auto max-w-[880px] px-6 pt-12 pb-24">
          <div data-reveal="" className="mb-8 flex flex-wrap items-center gap-3 text-sm text-ink-3">
            {entry.isDemo ? <DemoBadge /> : null}
            {entry.publishedAt ? (
              <time dateTime={entry.publishedAt}>{formatDateFa(entry.publishedAt)}</time>
            ) : null}
            {entry.author ? <span>· {entry.author.name}</span> : null}
          </div>
          <MarkdownBody source={entry.body} />

          {entry.references.length > 0 ? (
            <section aria-labelledby="refs" className="mt-12 max-w-3xl">
              <h2 id="refs" className="mb-3 font-display text-lg font-extrabold text-ink">
                منابع
              </h2>
              <ol className="list-decimal ps-6 text-[15px] leading-loose text-ink-3">
                {entry.references.map((ref, i) => (
                  <li key={`${ref.title}-${i}`}>
                    {ref.url ? (
                      <a href={ref.url} target="_blank" rel="noopener noreferrer nofollow">
                        {ref.title}
                      </a>
                    ) : (
                      ref.title
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {entry.tags.length > 0 ? (
            <ul aria-label="برچسب‌ها" className="mt-10 flex flex-wrap gap-2">
              {entry.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-paper-line bg-paper px-3 py-1.5 text-[13px] text-ink-3"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-12">
            <Link href={base} className={sectionLinkClasses()}>
              بازگشت به {copy.crumb} ‹
            </Link>
          </p>
        </article>
      </div>
    </>
  );
}
