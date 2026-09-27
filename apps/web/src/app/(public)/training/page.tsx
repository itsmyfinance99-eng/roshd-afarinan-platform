import { cn, Container, EmptyState, ErrorMessage, Notice } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CourseCard } from '@/components/cards/cards';
import { CategoryLinks, PageLinks } from '@/components/content/listing';
import { PageIntro } from '@/components/layout/page-shell';
import { listCourseCategories, listCourses } from '@/lib/learning-api';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'آموزش',
  description: 'آموزش تخصصی سرمایه‌گذاری، اقتصاد، امکان‌سنجی و تأمین مالی.',
  path: '/training',
});

const PAGE_SIZE = 12;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/** Server-rendered catalog; filters and paging live in the URL (crawlable, no JavaScript needed). */
export default async function TrainingPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const category = one(params.category);
  const free = one(params.free) === 'true';
  const page = Math.max(1, Number(one(params.page)) || 1);

  const [courses, categories] = await Promise.all([
    listCourses({ page, pageSize: PAGE_SIZE, category, free }),
    listCourseCategories(),
  ]);
  const items = courses.ok ? courses.data : [];
  const filters: Record<string, string> = {
    ...(category ? { category } : {}),
    ...(free ? { free: 'true' } : {}),
  };
  const toggleFree = new URLSearchParams(category ? { category } : {});
  if (!free) toggleFree.set('free', 'true');
  const toggleHref = `/training${toggleFree.size ? `?${toggleFree.toString()}` : ''}`;

  return (
    <>
      <PageIntro
        path="/training"
        crumb="آموزش"
        title="آموزش تخصصی سرمایه‌گذاری، اقتصاد، امکان‌سنجی و تأمین مالی"
        lead="دوره‌ها و کارگاه‌های تخصصی برای مدیران، کارآفرینان و کارشناسان."
      />
      <Container className="pt-12 pb-20">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-x-6">
          {categories.ok && categories.data.length > 0 ? (
            <CategoryLinks
              base="/training"
              categories={categories.data}
              active={category}
              extraQuery={free ? { free: 'true' } : {}}
            />
          ) : (
            <span />
          )}
          <Link
            href={toggleHref}
            aria-current={free ? 'true' : undefined}
            className={cn(
              'mb-7 inline-flex h-10 items-center rounded-chip border px-3.5 text-sm font-semibold no-underline',
              free
                ? 'border-brand-900 bg-brand-900 text-white hover:text-white'
                : 'border-line-strong bg-white text-ink-2 hover:border-primary',
            )}
          >
            فقط دوره‌های رایگان
          </Link>
        </div>
        {items.some((c) => c.isDemo) ? (
          <Notice className="mb-7">
            دوره‌های برچسب‌خورده «نمونه نمایشی» هستند و جایگزین خواهند شد. برای اطلاع از دوره‌های
            واقعی{' '}
            <Link href="/contact" className="font-bold">
              با ما تماس بگیرید
            </Link>
            .
          </Notice>
        ) : null}
        {!courses.ok ? (
          <ErrorMessage>
            دریافت فهرست دوره‌ها در حال حاضر ممکن نیست. لطفاً چند دقیقه بعد دوباره تلاش کنید.
          </ErrorMessage>
        ) : items.length === 0 ? (
          <EmptyState
            title={
              Object.keys(filters).length
                ? 'دوره‌ای با این فیلترها یافت نشد'
                : 'هنوز دوره‌ای منتشر نشده است'
            }
            description="برای اطلاع از برنامه دوره‌ها و کارگاه‌های آینده با ما در تماس باشید."
            action={
              <Link href="/contact" className="font-bold no-underline">
                تماس با ما ‹
              </Link>
            }
          />
        ) : (
          // A named section between the page title and the h3 card titles keeps the heading
          // order intact and gives the list an accessible name (ST-26.10, finding I-10).
          <section aria-labelledby="courses-heading">
            <h2 id="courses-heading" className="sr-only">
              فهرست دوره‌ها
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,270px),1fr))] gap-5">
              {items.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          </section>
        )}
        {courses.ok ? (
          <PageLinks
            base="/training"
            page={page}
            pageSize={PAGE_SIZE}
            total={courses.meta?.total ?? items.length}
            query={filters}
          />
        ) : null}
      </Container>
    </>
  );
}
