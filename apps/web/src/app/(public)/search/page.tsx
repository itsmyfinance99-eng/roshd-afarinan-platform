import { Container, DemoBadge, EmptyState, toPersianDigits } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/layout/page-shell';
import { listContent } from '@/lib/content-api';
import { listInvestments } from '@/lib/investment-api';
import { listCourses } from '@/lib/learning-api';
import { listResearch } from '@/lib/research-api';
import { type LocalHit, searchLocalContent } from '@/lib/local-search';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({ title: 'جستجو', path: '/search', noIndex: true });

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const raw = (await searchParams).q;
  const query = (typeof raw === 'string' ? raw : '').trim().slice(0, 100);
  const [articles, knowledge, courses, research, investments] = query
    ? await Promise.all([
        listContent('ARTICLE', { q: query, pageSize: 10 }),
        listContent('KNOWLEDGE', { q: query, pageSize: 10 }),
        listCourses({ q: query, pageSize: 10 }),
        listResearch({ q: query, pageSize: 10 }),
        listInvestments({ q: query, pageSize: 10 }),
      ])
    : [null, null, null, null, null];
  const cmsHits: LocalHit[] = [
    ...(investments?.ok ? investments.data : []).map((p) => ({
      title: p.title,
      type: 'طرح',
      href: `/investment/${p.slug}`,
      isDemo: p.isDemo,
    })),
    ...(research?.ok ? research.data : []).map((r) => ({
      title: r.title,
      type: 'پژوهش',
      href: `/research/${r.slug}`,
      isDemo: r.isDemo,
    })),
    ...(courses?.ok ? courses.data : []).map((c) => ({
      title: c.title,
      type: 'دوره',
      href: `/training/${c.slug}`,
      isDemo: c.isDemo,
    })),
    ...(articles?.ok ? articles.data : []).map((a) => ({
      title: a.title,
      type: 'مقاله',
      href: `/articles/${a.slug}`,
      isDemo: a.isDemo,
    })),
    ...(knowledge?.ok ? knowledge.data : []).map((k) => ({
      title: k.title,
      type: 'دانشنامه',
      href: `/knowledge/${k.slug}`,
      isDemo: k.isDemo,
    })),
  ];
  const hits = [...cmsHits, ...searchLocalContent(query)];

  return (
    <>
      <PageIntro
        path="/search"
        crumb="جستجو"
        title={query ? `نتایج جستجو برای «${query}»` : 'جستجو در سایت'}
      />
      <Container className="max-w-4xl py-12">
        <form action="/search" method="get" role="search" className="mb-8 flex gap-3">
          <label htmlFor="q" className="sr-only">
            عبارت جستجو
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            maxLength={100}
            placeholder="جستجو در دوره‌ها، پروژه‌ها، مقالات و دانشنامه…"
            className="h-12 flex-1 rounded-control border border-line-strong px-4 outline-none focus-visible:border-primary"
          />
          <button
            type="submit"
            className="h-12 cursor-pointer rounded-control bg-primary px-6 font-bold text-white"
          >
            جستجو
          </button>
        </form>

        {!query ? (
          <p className="text-ink-5">
            عبارتی برای جستجو وارد کنید. پیشنهاد: امکان‌سنجی، تأمین مالی، معدنی
          </p>
        ) : hits.length === 0 ? (
          <EmptyState
            title="نتیجه‌ای یافت نشد"
            description="عبارت دیگری را امتحان کنید یا از منوی اصلی استفاده کنید."
          />
        ) : (
          <>
            <p aria-live="polite" className="mb-4 text-sm text-ink-4">
              {toPersianDigits(hits.length)} نتیجه
            </p>
            <ul className="flex flex-col gap-1">
              {hits.map((hit, i) => (
                <li key={`${hit.href}-${hit.title}-${i}`}>
                  <Link
                    href={hit.href}
                    className="flex items-center justify-between gap-3 rounded-control p-3 text-ink no-underline hover:bg-primary-soft hover:text-ink"
                  >
                    <span className="text-[15px]">{hit.title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {hit.isDemo ? <DemoBadge /> : null}
                      <span className="rounded-chip bg-surface-2 px-2 py-[3px] text-xs text-ink-4">
                        {hit.type}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Container>
    </>
  );
}
