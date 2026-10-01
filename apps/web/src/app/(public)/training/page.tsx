import { cn, Container, ErrorMessage, Notice, SwitchKnob, toPersianDigits } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CourseCard } from '@/components/cards/cards';
import {
  CategoryLinks,
  ListingCount,
  ListingEmpty,
  ListingTransition,
  listingHref,
  PageLinks,
  PendingResults,
  resetButton,
} from '@/components/content/listing';
import { FilterLink } from '@/components/content/listing-client';
import { PageIntro } from '@/components/layout/page-shell';
import { listCourseCategories, listCourses } from '@/lib/learning-api';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'آموزش',
  description: 'آموزش تخصصی سرمایه‌گذاری، اقتصاد، امکان‌سنجی و تأمین مالی.',
  path: '/training',
});

const PAGE_SIZE = 12;
const GRID = 'grid-cols-[repeat(auto-fill,minmax(min(100%,270px),1fr))]';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/**
 * Course catalog (design Training.dc.html). Filters and paging live in the URL (crawlable,
 * no JavaScript needed); with JavaScript the chips slide and the grid shows skeletons while
 * the next results render.
 */
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
  const total = courses.ok ? (courses.meta?.total ?? items.length) : 0;
  const filtered = Boolean(category || free);
  const filters: Record<string, string> = {
    ...(category ? { category } : {}),
    ...(free ? { free: 'true' } : {}),
  };
  const toggleHref = listingHref('/training', { category, free: free ? undefined : 'true' });
  const allDemo = items.length > 0 && items.every((c) => c.isDemo);

  return (
    <>
      <PageIntro
        path="/training"
        crumb="آموزش"
        title="آموزش تخصصی سرمایه‌گذاری، اقتصاد، امکان‌سنجی و تأمین مالی"
        lead="دوره‌ها و کارگاه‌های تخصصی برای مدیران، کارآفرینان و کارشناسان."
      />
      <ListingTransition>
        <Container className="pt-12 pb-24">
          <section aria-labelledby="catalog-title">
            <h2 id="catalog-title" className="sr-only">
              فهرست دوره‌ها
            </h2>
            <div
              data-reveal=""
              className="mb-3 flex flex-wrap items-center justify-between gap-4 rounded-panel border border-line bg-brand-700 p-3"
            >
              {categories.ok && categories.data.length > 0 ? (
                <CategoryLinks
                  base="/training"
                  categories={categories.data}
                  active={category}
                  extraQuery={free ? { free: 'true' } : {}}
                  sliding
                  className=""
                />
              ) : (
                <span />
              )}
              <FilterLink
                href={toggleHref}
                aria-current={free ? 'true' : undefined}
                className="flex items-center gap-2.5 pe-1 text-sm text-ink no-underline hover:text-ink"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors duration-[250ms] ease-state',
                    free ? 'bg-primary' : 'bg-line-strong',
                  )}
                >
                  <SwitchKnob on={free} />
                </span>
                فقط دوره‌های رایگان
              </FilterLink>
            </div>
            {courses.ok ? (
              <ListingCount className="mb-6">
                {toPersianDigits(total)} دوره{allDemo ? ' نمونه' : ''}
              </ListingCount>
            ) : null}
            {items.some((c) => c.isDemo) && !allDemo ? (
              <Notice className="mb-6">
                دوره‌های برچسب‌خورده «نمونه نمایشی» هستند و جایگزین خواهند شد. برای اطلاع از
                دوره‌های واقعی{' '}
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
            ) : (
              <PendingResults columns={GRID}>
                {items.length === 0 ? (
                  filtered ? (
                    <ListingEmpty
                      title="دوره‌ای در این دسته وجود ندارد"
                      description="دسته دیگری را انتخاب کنید یا فیلتر رایگان را بردارید."
                      resetHref="/training"
                      resetLabel="نمایش همه دوره‌ها"
                    />
                  ) : (
                    <ListingEmpty
                      title="هنوز دوره‌ای منتشر نشده است"
                      description="برای اطلاع از برنامه دوره‌ها و کارگاه‌های آینده با ما در تماس باشید."
                      extraAction={
                        <Link href="/contact" className={resetButton}>
                          تماس با ما
                        </Link>
                      }
                    />
                  )
                ) : (
                  <div data-stagger="70" className={cn('grid gap-5', GRID)}>
                    {items.map((course) => (
                      <div key={course.id} data-reveal="">
                        <CourseCard course={course} />
                      </div>
                    ))}
                  </div>
                )}
              </PendingResults>
            )}
            {courses.ok ? (
              <PageLinks
                base="/training"
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                query={filters}
              />
            ) : null}
          </section>
        </Container>
      </ListingTransition>
    </>
  );
}
