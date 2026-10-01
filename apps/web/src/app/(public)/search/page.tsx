import {
  buttonClasses,
  cn,
  Container,
  DemoBadge,
  EmptyState,
  ErrorMessage,
  toPersianDigits,
} from '@roshd/ui';
import {
  SEARCH_TYPE_LABELS_FA,
  SEARCH_TYPE_ROUTES,
  SEARCH_TYPES,
  type SearchType,
} from '@roshd/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageLinks } from '@/components/content/listing';
import { PageIntro } from '@/components/layout/page-shell';
import { searchLocalContent } from '@/lib/local-search';
import { searchSite } from '@/lib/search-api';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({ title: 'جستجو', path: '/search', noIndex: true });

const PAGE_SIZE = 20;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/** Server-rendered results from GET /api/v1/search, plus static pages (journeys, services). */
export default async function SearchPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const query = (one(params.q) ?? '').trim().slice(0, 100);
  const type = SEARCH_TYPES.find((t) => t === one(params.type));
  const page = Math.max(1, Math.min(20, Number(one(params.page)) || 1));
  const searchable = query.length >= 2;

  const result = searchable
    ? await searchSite({ q: query, type, page, pageSize: PAGE_SIZE })
    : null;
  const hits = result?.ok ? result.data : [];
  const total = result?.ok ? (result.meta?.total ?? hits.length) : 0;
  // Static pages are shown on the first, unfiltered page only.
  const staticHits = searchable && !type && page === 1 ? searchLocalContent(query, 10) : [];
  const count = total + staticHits.length;

  const typeHref = (t?: SearchType) => {
    const q = new URLSearchParams({ q: query });
    if (t) q.set('type', t);
    return `/search?${q.toString()}`;
  };
  const chip = (on: boolean) =>
    cn(
      'inline-flex h-9 items-center rounded-chip border px-3 text-[13px] font-semibold no-underline transition-colors',
      on
        ? 'border-primary bg-primary text-on-primary hover:text-on-primary'
        : 'border-line-strong bg-brand-700 text-ink-3 hover:border-primary hover:text-ink',
    );

  return (
    <>
      <PageIntro
        path="/search"
        crumb="جستجو"
        title={query ? `نتایج جستجو برای «${query}»` : 'جستجو در سایت'}
      />
      <Container className="max-w-4xl py-12">
        <form action="/search" method="get" role="search" className="mb-6 flex gap-3">
          <label htmlFor="q" className="sr-only">
            عبارت جستجو
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            minLength={2}
            maxLength={100}
            placeholder="جستجو در دوره‌ها، پژوهش‌ها، طرح‌ها، مقالات و دانشنامه…"
            className="h-[54px] min-w-0 flex-1 rounded-control border border-line-strong bg-brand-700 px-4 text-base text-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-ink-5 focus:border-focus focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_15%,transparent)] focus-visible:outline-none"
          />
          {type ? <input type="hidden" name="type" value={type} /> : null}
          <button type="submit" className={buttonClasses('primary', 'lg')}>
            جستجو
          </button>
        </form>

        {searchable ? (
          <nav aria-label="نوع نتیجه" className="mb-6 flex flex-wrap gap-2">
            <Link
              href={typeHref()}
              aria-current={!type ? 'page' : undefined}
              className={chip(!type)}
            >
              همه
            </Link>
            {SEARCH_TYPES.map((t) => (
              <Link
                key={t}
                href={typeHref(t)}
                aria-current={type === t ? 'page' : undefined}
                className={chip(type === t)}
              >
                {SEARCH_TYPE_LABELS_FA[t]}
              </Link>
            ))}
          </nav>
        ) : null}

        {!searchable ? (
          <p className="text-ink-5">
            {query
              ? 'دست‌کم ۲ نویسه برای جستجو وارد کنید.'
              : 'عبارتی برای جستجو وارد کنید. پیشنهاد: امکان‌سنجی، تأمین مالی، معدنی'}
          </p>
        ) : (
          <>
            {result && !result.ok ? (
              <ErrorMessage className="mb-4">
                جستجو در محتوای سایت در حال حاضر ممکن نیست. لطفاً چند دقیقه بعد دوباره تلاش کنید.
              </ErrorMessage>
            ) : null}
            {count === 0 && result?.ok ? (
              <EmptyState
                title="نتیجه‌ای یافت نشد"
                description="عبارت یا نوع دیگری را امتحان کنید، یا از منوی اصلی استفاده کنید."
              />
            ) : count > 0 ? (
              <>
                <p aria-live="polite" className="mb-4 text-[13px] text-ink-5">
                  {toPersianDigits(count)} نتیجه
                </p>
                <ul className="flex flex-col gap-1 border-t border-line pt-2">
                  {staticHits.map((hit) => (
                    <li key={`static-${hit.href}-${hit.title}`}>
                      <Link
                        href={hit.href}
                        className="flex items-center justify-between gap-3 rounded-control p-3 text-ink no-underline transition-colors hover:bg-graphite-600 hover:text-ink"
                      >
                        <span className="text-[15px]">{hit.title}</span>
                        <span className="shrink-0 rounded-chip bg-graphite-600 px-2 py-[3px] text-xs text-ink-3">
                          {hit.type}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {hits.map((hit) => (
                    <li key={`${hit.type}-${hit.id}`}>
                      <Link
                        href={`${SEARCH_TYPE_ROUTES[hit.type]}/${hit.slug}`}
                        className="flex items-start justify-between gap-3 rounded-control p-3 text-ink no-underline transition-colors hover:bg-graphite-600 hover:text-ink"
                      >
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="text-[15px] font-semibold">{hit.title}</span>
                          {hit.excerpt ? (
                            <span className="line-clamp-2 text-sm text-ink-3">{hit.excerpt}</span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {hit.isDemo ? <DemoBadge /> : null}
                          <span className="rounded-chip bg-graphite-600 px-2 py-[3px] text-xs text-ink-3">
                            {SEARCH_TYPE_LABELS_FA[hit.type]}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {result?.ok ? (
                  <PageLinks
                    base="/search"
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    query={{ q: query, ...(type ? { type } : {}) }}
                  />
                ) : null}
              </>
            ) : null}
          </>
        )}
      </Container>
    </>
  );
}
