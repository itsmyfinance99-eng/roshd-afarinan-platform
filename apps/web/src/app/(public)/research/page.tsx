import { buttonClasses, Container, Notice, toPersianDigits } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CategoryLinks, ContentGrid, PageLinks } from '@/components/content/listing';
import { PageIntro } from '@/components/layout/page-shell';
import { pastWorkSectors } from '@/content/site';
import { listResearch, listResearchCategories } from '@/lib/research-api';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'پژوهش',
  description: 'مطالعات اقتصادی، صنعتی، مالی و توسعه‌ای و ثبت سفارش پژوهش اختصاصی.',
  path: '/research',
});

const PAGE_SIZE = 12;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function ResearchPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const category = one(params.category);
  const page = Math.max(1, Number(one(params.page)) || 1);
  const [projects, categories] = await Promise.all([
    listResearch({ page, pageSize: PAGE_SIZE, category }),
    listResearchCategories(),
  ]);
  const items = projects.ok ? projects.data : [];

  return (
    <>
      <PageIntro
        path="/research"
        crumb="پژوهش"
        title="مطالعات اقتصادی، صنعتی، مالی و توسعه‌ای"
        lead="پژوهش‌های کاربردی برای سازمان‌ها، طرح‌ها و سیاست‌گذاری."
      />
      <Container className="pt-12 pb-20">
        {categories.ok && categories.data.length > 0 ? (
          <CategoryLinks base="/research" categories={categories.data} active={category} />
        ) : null}
        {items.some((p) => p.isDemo) ? (
          <Notice className="mb-7">
            عناوین برچسب‌خورده «نمونه نمایشی» هستند و پس از انتشار گزارش‌های تأییدشده جایگزین
            می‌شوند.
          </Notice>
        ) : null}
        <ContentGrid
          items={items.map((p) => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            excerpt: p.summary,
            publishedAt: p.publishedAt,
            isDemo: p.isDemo,
            category: p.category,
            note: p.year ? `سال ${toPersianDigits(p.year)}` : undefined,
          }))}
          base="/research"
          cta="مشاهده پژوهش"
          unavailable={!projects.ok}
          empty={
            category
              ? undefined
              : {
                  title: 'هنوز پژوهشی منتشر نشده است',
                  description: 'گزارش‌های تأییدشده به‌زودی در این بخش منتشر می‌شوند.',
                }
          }
        />
        {projects.ok ? (
          <PageLinks
            base="/research"
            page={page}
            pageSize={PAGE_SIZE}
            total={projects.meta?.total ?? items.length}
            query={category ? { category } : {}}
          />
        ) : null}

        <section aria-labelledby="fields-title" className="mt-14">
          <h2 id="fields-title" className="mb-4 text-xl font-extrabold text-brand-900">
            حوزه‌های سوابق مطالعاتی
          </h2>
          <ul className="flex flex-wrap gap-2">
            {pastWorkSectors.map((sector) => (
              <li key={sector} className="rounded-chip bg-surface px-3.5 py-2 text-sm text-ink-2">
                {sector}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-card border border-line-2 bg-surface p-7">
          <p className="text-[17px] font-bold text-brand-900">نیاز به مطالعه اختصاصی دارید؟</p>
          <Link href="/research/request" className={buttonClasses('primary', 'md', 'h-12')}>
            ثبت سفارش پژوهش
          </Link>
        </div>
      </Container>
    </>
  );
}
