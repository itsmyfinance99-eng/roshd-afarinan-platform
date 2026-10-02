import { EmptyState, ErrorMessage, toPersianDigits } from '@roshd/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ContentCard } from '@/components/cards/cards';
import type { ContentCategory } from '@/lib/content-api';
import { ChipLinks, PendingResults } from './listing-client';

export { ListingCount, ListingTransition, PendingResults } from './listing-client';

/** Minimal card data shared by CMS entries and catalog records (research). */
export interface GridItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  isDemo: boolean;
  category: { name: string } | null;
  /** Extra label beside the date, e.g. the study year. */
  note?: string;
}

/** `base?category=…` keeping the other filters. */
export function listingHref(base: string, query: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) q.set(key, value);
  const qs = q.toString();
  return `${base}${qs ? `?${qs}` : ''}`;
}

/** Category filter as links (works without JavaScript, crawlable). */
export function CategoryLinks({
  base,
  categories,
  active,
  extraQuery = {},
  sliding = false,
  size = 'md',
  className = 'mb-7',
}: {
  base: string;
  categories: ContentCategory[];
  active?: string;
  extraQuery?: Record<string, string>;
  sliding?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const items = [
    { label: 'همه', href: listingHref(base, extraQuery), active: !active },
    ...categories.map((c) => ({
      label: c.name,
      href: listingHref(base, { ...extraQuery, category: c.slug }),
      active: active === c.slug,
    })),
  ];
  return (
    <ChipLinks
      label="دسته‌بندی"
      items={items}
      sliding={sliding}
      variant={sliding ? 'plain' : 'bordered'}
      size={size}
      className={className}
    />
  );
}

/** Outlined copper button of the design's empty states («حذف فیلترها», «نمایش همه …»). */
export const resetButton =
  'inline-flex h-[42px] items-center rounded-control border border-primary bg-brand-700 px-[18px] text-sm font-bold text-accent no-underline transition-colors hover:bg-primary hover:text-on-primary';

/** Design empty state (dashed panel, icon, title, hint, reset action). */
export function ListingEmpty({
  title,
  description,
  resetHref,
  resetLabel,
  extraAction,
}: {
  title: string;
  description: string;
  resetHref?: string;
  resetLabel?: string;
  extraAction?: ReactNode;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      className="py-16"
      action={
        resetHref || extraAction ? (
          <div className="flex flex-wrap justify-center gap-3">
            {resetHref ? (
              <Link href={resetHref} className={resetButton}>
                {resetLabel ?? 'حذف فیلترها'}
              </Link>
            ) : null}
            {extraAction}
          </div>
        ) : undefined
      }
    />
  );
}

export function ContentGrid({
  items,
  base,
  cta,
  unavailable,
  empty,
  resetHref,
}: {
  items: GridItem[];
  base: string;
  cta: string;
  unavailable: boolean;
  empty?: { title: string; description: string };
  resetHref?: string;
}) {
  if (unavailable) {
    return (
      <ErrorMessage>
        دریافت محتوا در حال حاضر ممکن نیست. لطفاً چند دقیقه بعد دوباره تلاش کنید.
      </ErrorMessage>
    );
  }
  const columns = 'grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))]';
  return (
    <PendingResults columns={columns} height="h-[210px]" skeletons={4}>
      {items.length === 0 ? (
        <ListingEmpty
          title={empty?.title ?? 'محتوایی یافت نشد'}
          description={empty?.description ?? 'دسته یا عبارت دیگری را امتحان کنید.'}
          resetHref={resetHref}
          resetLabel="نمایش همه"
        />
      ) : (
        <div data-stagger="70" className={`grid gap-4 ${columns}`}>
          {items.map((item) => (
            <div key={item.id} data-reveal="">
              <ContentCard
                headingLevel={2}
                item={{
                  id: item.id,
                  title: item.title,
                  summary: item.excerpt ?? '',
                  category: item.category?.name ?? '',
                  date: item.publishedAt ?? '',
                  isDemo: item.isDemo,
                }}
                note={item.note}
                cta={cta}
                href={`${base}/${item.slug}`}
              />
            </div>
          ))}
        </div>
      )}
    </PendingResults>
  );
}

export function PageLinks({
  base,
  page,
  pageSize,
  total,
  query = {},
}: {
  base: string;
  page: number;
  pageSize: number;
  total: number;
  query?: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => listingHref(base, { ...query, page: p > 1 ? String(p) : undefined });
  const step =
    'inline-flex h-10 items-center rounded-control border border-line-strong px-4 font-semibold text-ink no-underline hover:border-primary hover:text-ink';
  return (
    <nav aria-label="صفحه‌بندی" className="mt-10 flex items-center justify-center gap-4 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={step}>
          › قبلی
        </Link>
      ) : null}
      <span className="text-ink-3">
        صفحه {toPersianDigits(page)} از {toPersianDigits(pages)}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} rel="next" className={step}>
          بعدی ‹
        </Link>
      ) : null}
    </nav>
  );
}
