import { Container, DemoBadge, formatDateFa, Notice } from '@roshd/ui';
import type { ContentKind } from '@roshd/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageIntro } from '@/components/layout/page-shell';
import { site } from '@/content/site';
import {
  getContent,
  KIND_ROUTE,
  listCategories,
  listContent,
  type ContentDetail,
} from '@/lib/content-api';
import { siteUrl } from '@/lib/env';
import { jsonLdScript } from '@/lib/seo';
import { CategoryLinks, ContentGrid, PageLinks } from './listing';
import { MarkdownBody } from './markdown';

const PAGE_SIZE = 12;

const COPY: Record<ContentKind, { crumb: string; title: string; lead: string; cta: string }> = {
  ARTICLE: {
    crumb: 'مقالات',
    title: 'مقالات و یادداشت‌های تخصصی',
    lead: 'یادداشت‌ها و مقالات کارشناسان درباره امکان‌سنجی، تأمین مالی، آموزش و پژوهش.',
    cta: 'ادامه مطلب',
  },
  KNOWLEDGE: {
    crumb: 'دانشنامه',
    title: 'مفاهیم کلیدی سرمایه‌گذاری، امکان‌سنجی و تأمین مالی',
    lead: 'مدخل‌های کوتاه و قابل‌جستجو برای آشنایی با اصطلاحات تخصصی.',
    cta: 'مطالعه مدخل',
  },
};

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/** Server-rendered listing for articles / knowledge (category + search + pagination via URL). */
export async function ContentListingPage({
  kind,
  searchParams,
}: {
  kind: ContentKind;
  searchParams: Search;
}) {
  const params = await searchParams;
  const category = one(params.category);
  const q = one(params.q)?.trim().slice(0, 100) || undefined;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const base = KIND_ROUTE[kind];
  const copy = COPY[kind];

  const [entries, categories] = await Promise.all([
    listContent(kind, { page, pageSize: PAGE_SIZE, category, q }),
    listCategories(kind),
  ]);
  const items = entries.ok ? entries.data : [];
  const extra: Record<string, string> = { ...(q ? { q } : {}) };

  return (
    <>
      <PageIntro path={base} crumb={copy.crumb} title={copy.title} lead={copy.lead} />
      <Container className="pt-12 pb-20">
        {kind === 'KNOWLEDGE' ? (
          <form action={base} method="get" role="search" className="mb-5 flex gap-3">
            <label htmlFor="kq" className="sr-only">
              جستجو در دانشنامه
            </label>
            <input
              id="kq"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={100}
              placeholder="مثلاً: طرح توجیهی"
              className="h-12 flex-1 rounded-control border border-line-strong px-4 outline-none focus-visible:border-primary"
            />
            {category ? <input type="hidden" name="category" value={category} /> : null}
            <button
              type="submit"
              className="h-12 cursor-pointer rounded-control bg-primary px-6 font-bold text-white"
            >
              جستجو
            </button>
          </form>
        ) : null}
        {categories.ok && categories.data.length > 0 ? (
          <CategoryLinks
            base={base}
            categories={categories.data}
            active={category}
            extraQuery={extra}
          />
        ) : null}
        {items.some((i) => i.isDemo) ? (
          <Notice className="mb-7">
            محتوای برچسب‌خورده «نمونه نمایشی» است و جایگزین خواهد شد.
          </Notice>
        ) : null}
        <ContentGrid items={items} base={base} cta={copy.cta} unavailable={!entries.ok} />
        {entries.ok ? (
          <PageLinks
            base={base}
            page={page}
            pageSize={PAGE_SIZE}
            total={entries.meta?.total ?? items.length}
            query={{ ...extra, ...(category ? { category } : {}) }}
          />
        ) : null}
      </Container>
    </>
  );
}

export async function contentMetadata(kind: ContentKind, slug: string): Promise<Metadata> {
  const result = await getContent(kind, slug);
  // Resolve 404 before any streaming starts so crawlers get a real 404 status.
  if (!result.ok && result.status === 404) notFound();
  if (!result.ok) return { title: COPY[kind].crumb, robots: { index: false } };
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

export async function ContentDetailPage({ kind, slug }: { kind: ContentKind; slug: string }) {
  const result = await getContent(kind, slug);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error('Content service unavailable');
  }
  const entry = result.data;
  const base = KIND_ROUTE[kind];
  const copy = COPY[kind];
  const path = `${base}/${entry.slug}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(articleJsonLd(kind, entry))}
      />
      <PageIntro
        path={path}
        crumb={entry.title}
        parent={{ label: copy.crumb, href: base }}
        eyebrow={entry.category?.name ?? copy.crumb}
        title={entry.title}
        lead={entry.excerpt ?? undefined}
      />
      <Container className="py-12">
        <div className="mb-8 flex flex-wrap items-center gap-3 text-sm text-ink-5">
          {entry.isDemo ? <DemoBadge /> : null}
          {entry.publishedAt ? (
            <time dateTime={entry.publishedAt}>{formatDateFa(entry.publishedAt)}</time>
          ) : null}
          {entry.author ? <span>· {entry.author.name}</span> : null}
        </div>
        <MarkdownBody source={entry.body} />

        {entry.references.length > 0 ? (
          <section aria-labelledby="refs" className="mt-12 max-w-3xl">
            <h2 id="refs" className="mb-3 text-lg font-extrabold text-brand-900">
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
              <li key={tag} className="rounded-chip bg-surface px-3 py-1.5 text-[13px] text-ink-3">
                {tag}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-12">
          <Link href={base} className="font-bold no-underline">
            بازگشت به {copy.crumb} ‹
          </Link>
        </p>
      </Container>
    </>
  );
}
