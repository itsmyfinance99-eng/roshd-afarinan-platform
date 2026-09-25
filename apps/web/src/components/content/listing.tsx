import { cn, DemoBadge, EmptyState, ErrorMessage, formatDateFa, toPersianDigits } from '@roshd/ui';
import Link from 'next/link';
import type { ContentCategory, ContentSummary } from '@/lib/content-api';

/** Category filter as plain links (works without JavaScript, crawlable). */
export function CategoryLinks({
  base,
  categories,
  active,
  extraQuery = {},
}: {
  base: string;
  categories: ContentCategory[];
  active?: string;
  extraQuery?: Record<string, string>;
}) {
  const href = (category?: string) => {
    const q = new URLSearchParams(extraQuery);
    if (category) q.set('category', category);
    const qs = q.toString();
    return `${base}${qs ? `?${qs}` : ''}`;
  };
  const chip = (on: boolean) =>
    cn(
      'inline-flex h-10 items-center rounded-chip border px-3.5 text-sm font-semibold no-underline',
      on
        ? 'border-brand-900 bg-brand-900 text-white hover:text-white'
        : 'border-line-strong bg-white text-ink-2 hover:border-primary',
    );
  return (
    <nav aria-label="دسته‌بندی" className="mb-7 flex flex-wrap gap-2">
      <Link href={href()} aria-current={!active ? 'page' : undefined} className={chip(!active)}>
        همه
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={href(c.slug)}
          aria-current={active === c.slug ? 'page' : undefined}
          className={chip(active === c.slug)}
        >
          {c.name}
        </Link>
      ))}
    </nav>
  );
}

export function ContentGrid({
  items,
  base,
  cta,
  unavailable,
}: {
  items: ContentSummary[];
  base: string;
  cta: string;
  unavailable: boolean;
}) {
  if (unavailable) {
    return (
      <ErrorMessage>
        دریافت محتوا در حال حاضر ممکن نیست. لطفاً چند دقیقه بعد دوباره تلاش کنید.
      </ErrorMessage>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState title="محتوایی یافت نشد" description="دسته یا عبارت دیگری را امتحان کنید." />
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-5">
      {items.map((item) => (
        <article
          key={item.id}
          className="flex flex-col gap-2.5 rounded-card border border-line bg-white p-[22px] hover:border-line-hover"
        >
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="font-bold text-primary">{item.category?.name ?? ''}</span>
            <span className="flex items-center gap-2">
              {item.isDemo ? <DemoBadge /> : null}
              {item.publishedAt ? (
                <time dateTime={item.publishedAt} className="text-ink-5">
                  {formatDateFa(item.publishedAt)}
                </time>
              ) : null}
            </span>
          </div>
          <h2 className="text-[17px] leading-[1.7] font-bold text-pretty text-ink">
            <Link
              href={`${base}/${item.slug}`}
              className="text-ink no-underline hover:text-primary"
            >
              {item.title}
            </Link>
          </h2>
          {item.excerpt ? (
            <p className="text-sm leading-[1.9] text-pretty text-ink-4">{item.excerpt}</p>
          ) : null}
          <Link
            href={`${base}/${item.slug}`}
            className="mt-auto pt-1.5 text-sm font-bold text-primary no-underline"
            aria-label={`${cta}: ${item.title}`}
          >
            {cta} ‹
          </Link>
        </article>
      ))}
    </div>
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
  const href = (p: number) => {
    const q = new URLSearchParams(query);
    if (p > 1) q.set('page', String(p));
    const qs = q.toString();
    return `${base}${qs ? `?${qs}` : ''}`;
  };
  return (
    <nav aria-label="صفحه‌بندی" className="mt-8 flex items-center justify-center gap-4 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev">
          قبلی
        </Link>
      ) : null}
      <span>
        صفحه {toPersianDigits(page)} از {toPersianDigits(pages)}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} rel="next">
          بعدی
        </Link>
      ) : null}
    </nav>
  );
}
