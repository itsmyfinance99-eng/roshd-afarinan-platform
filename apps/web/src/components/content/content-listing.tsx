import { cn, Container, DemoBadge, ErrorMessage, formatDateFa, Notice } from '@roshd/ui';
import type { ContentKind } from '@roshd/validation';
import Link from 'next/link';
import { ContentCard } from '@/components/cards/cards';
import { PageIntro } from '@/components/layout/page-shell';
import { KIND_ROUTE, listCategories, listContent, type ContentSummary } from '@/lib/content-api';
import {
  CategoryLinks,
  ListingEmpty,
  ListingTransition,
  PageLinks,
  PendingResults,
} from './listing';

const PAGE_SIZE = 12;

export const CONTENT_COPY: Record<
  ContentKind,
  { crumb: string; title: string; lead: string; cta: string }
> = {
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

const unavailableMessage = (
  <ErrorMessage>
    دریافت محتوا در حال حاضر ممکن نیست. لطفاً چند دقیقه بعد دوباره تلاش کنید.
  </ErrorMessage>
);

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

/**
 * Articles (card grid with image slots, design Articles.dc.html) and knowledge (searchable
 * rows, design Knowledge.dc.html). Category, search and paging live in the URL.
 */
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
  const copy = CONTENT_COPY[kind];

  const [entries, categories] = await Promise.all([
    listContent(kind, { page, pageSize: PAGE_SIZE, category, q }),
    listCategories(kind),
  ]);
  const items = entries.ok ? entries.data : [];
  const extra: Record<string, string> = { ...(q ? { q } : {}) };
  const knowledge = kind === 'KNOWLEDGE';
  const resetHref = category || q ? base : undefined;

  return (
    <>
      <PageIntro path={base} crumb={copy.crumb} title={copy.title} lead={copy.lead} />
      <ListingTransition>
        <Container className={cn('pt-12 pb-20', knowledge && 'max-w-[960px]')}>
          {knowledge ? (
            <form action={base} method="get" role="search" className="mb-4">
              <label htmlFor="kq" className="mb-2 block text-sm font-bold text-ink">
                جستجو در دانشنامه
              </label>
              <div className="relative">
                <input
                  id="kq"
                  name="q"
                  type="search"
                  defaultValue={q}
                  maxLength={100}
                  placeholder="مثلاً: طرح توجیهی"
                  className="h-[54px] w-full rounded-control border border-line-strong bg-brand-700 ps-4 pe-14 text-base text-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-ink-5 focus:border-focus focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_15%,transparent)] focus-visible:outline-none"
                />
                <button
                  type="submit"
                  aria-label="جستجو"
                  className="absolute top-1/2 left-2 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-control text-ink-5 hover:text-accent"
                >
                  <SearchIcon />
                </button>
              </div>
              {category ? <input type="hidden" name="category" value={category} /> : null}
            </form>
          ) : null}
          {categories.ok && categories.data.length > 0 ? (
            <CategoryLinks
              base={base}
              categories={categories.data}
              active={category}
              extraQuery={extra}
              size={knowledge ? 'sm' : 'md'}
            />
          ) : null}
          {items.some((i) => i.isDemo) ? (
            <Notice className="mb-7">
              محتوای برچسب‌خورده «نمونه نمایشی» است و جایگزین خواهد شد.
            </Notice>
          ) : null}
          {!entries.ok ? (
            unavailableMessage
          ) : knowledge ? (
            <KnowledgeList items={items} resetHref={resetHref} />
          ) : (
            <ArticleGrid items={items} resetHref={resetHref} cta={copy.cta} />
          )}
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
      </ListingTransition>
    </>
  );
}

const ARTICLE_GRID = 'grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))]';

function ArticleGrid({
  items,
  resetHref,
  cta,
}: {
  items: ContentSummary[];
  resetHref?: string;
  cta: string;
}) {
  return (
    <PendingResults columns={ARTICLE_GRID} height="h-[380px]">
      {items.length === 0 ? (
        <ListingEmpty
          title={resetHref ? 'مقاله‌ای یافت نشد' : 'هنوز مقاله‌ای منتشر نشده است'}
          description={
            resetHref ? 'دسته دیگری را امتحان کنید.' : 'مقالات تأییدشده به‌زودی منتشر می‌شوند.'
          }
          resetHref={resetHref}
          resetLabel="نمایش همه مقالات"
        />
      ) : (
        <div data-stagger="70" className={cn('grid gap-5', ARTICLE_GRID)}>
          {items.map((entry) => (
            <div key={entry.id} data-reveal="">
              <ContentCard
                headingLevel={2}
                media={{ cover: entry.coverImageUrl, label: 'تصویر مقاله' }}
                item={{
                  id: entry.id,
                  title: entry.title,
                  summary: entry.excerpt ?? '',
                  category: entry.category?.name ?? '',
                  date: entry.publishedAt ?? '',
                  isDemo: entry.isDemo,
                }}
                cta={cta}
                href={`/articles/${entry.slug}`}
              />
            </div>
          ))}
        </div>
      )}
    </PendingResults>
  );
}

function KnowledgeList({ items, resetHref }: { items: ContentSummary[]; resetHref?: string }) {
  return (
    <PendingResults columns="grid-cols-1" height="h-[110px]" skeletons={4}>
      {items.length === 0 ? (
        <ListingEmpty
          title={resetHref ? 'مدخلی یافت نشد' : 'هنوز مدخلی منتشر نشده است'}
          description={
            resetHref ? 'عبارت دیگری را جستجو کنید.' : 'مدخل‌های دانشنامه به‌زودی منتشر می‌شوند.'
          }
          resetHref={resetHref}
          resetLabel="نمایش همه مدخل‌ها"
        />
      ) : (
        <ul data-stagger="50" className="border-t border-line">
          {items.map((entry) => (
            <li
              key={entry.id}
              data-reveal=""
              className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 border-b border-line px-2 py-5 transition-colors hover:bg-brand-700"
            >
              <h2 className="text-lg font-black text-ink">
                <Link
                  href={`/knowledge/${entry.slug}`}
                  className="text-ink no-underline outline-none after:absolute after:inset-0 hover:text-ink focus-visible:underline"
                >
                  {entry.title}
                </Link>
              </h2>
              <span className="flex items-center gap-2 text-[13px] font-bold text-accent">
                {entry.isDemo ? <DemoBadge size="sm" /> : null}
                {entry.category?.name}
              </span>
              <p className="text-sm leading-[1.9] text-ink-3">{entry.excerpt}</p>
              {entry.publishedAt ? (
                <time dateTime={entry.publishedAt} className="text-[13px] text-ink-5">
                  {formatDateFa(entry.publishedAt)}
                </time>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}
    </PendingResults>
  );
}
