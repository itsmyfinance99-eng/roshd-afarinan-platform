import { buttonClasses, DemoBadge, formatDateFa, sectionLinkClasses, Shine } from '@roshd/ui';
import { COURSE_LEVEL_LABELS_FA, DELIVERY_MODE_LABELS_FA } from '@roshd/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CourseCard } from '@/components/cards/cards';
import { MarkdownBody } from '@/components/content/markdown';
import {
  courseDurationLabel,
  coursePriceLabel,
  localCover,
} from '@/components/courses/course-format';
import { BuyCourseButton } from '@/components/courses/buy-course';
import { courseJsonLd, loadCourse } from '@/components/courses/course-pages';
import { PageIntro } from '@/components/layout/page-shell';
import { ReadingProgress } from '@/components/motion/reading-progress';
import { site } from '@/content/site';
import { getPaymentStatus, listCourses } from '@/lib/learning-api';
import { jsonLdScript } from '@/lib/seo';

export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const course = await loadCourse((await params).slug);
  const path = `/training/${course.slug}`;
  const title = course.metaTitle ?? course.title;
  const description = course.metaDescription ?? course.summary;
  const cover = localCover(course.coverImageUrl);
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: course.noIndex || course.isDemo ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      locale: 'fa_IR',
      siteName: site.name,
      url: path,
      title,
      description,
      images: cover ? [cover] : undefined,
    },
  };
}

const sectionTitle = 'mb-5 font-display text-[clamp(22px,2.4vw,28px)] font-extrabold text-ink';

/** Course detail (design Course.dc.html): paper article + sticky dark summary card. */
export default async function CoursePage({ params }: { params: Params }) {
  const [course, payment] = await Promise.all([
    loadCourse((await params).slug),
    getPaymentStatus(),
  ]);
  const related = await listCourses({ pageSize: 3, category: course.category?.slug });
  const others = (related.ok ? related.data : []).filter((c) => c.id !== course.id).slice(0, 2);
  const path = `/training/${course.slug}`;
  const purchasable =
    payment.ok && payment.data.enabled && !course.isFree && Boolean(course.priceRials);
  const duration = courseDurationLabel(course.durationHours);
  const level = COURSE_LEVEL_LABELS_FA[course.level];
  const price = coursePriceLabel(course);
  const lead = [`دوره ${level}`, duration, price].filter(Boolean).join(' · ');
  const facts: [string, string][] = [];
  if (course.category) facts.push(['دسته', course.category.name]);
  facts.push(['سطح', level]);
  facts.push(['نحوه برگزاری', DELIVERY_MODE_LABELS_FA[course.deliveryMode]]);
  if (duration) facts.push(['مدت', duration]);
  if (course.instructor) facts.push(['مدرس', course.instructor.name]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(courseJsonLd(course))}
      />
      <ReadingProgress />
      <PageIntro
        path={path}
        crumb={course.title}
        parent={{ label: 'آموزش', href: '/training' }}
        eyebrow={course.category?.name ?? 'دوره آموزشی'}
        title={course.title}
        lead={lead}
      />
      <div data-surface="paper" className="border-b border-paper-line">
        <div className="mx-auto grid max-w-(--container-page) grid-cols-1 items-start gap-12 px-6 pt-12 pb-24 min-[980px]:grid-cols-[minmax(0,1fr)_360px]">
          <article className="flex min-w-0 flex-col gap-12">
            {course.isDemo ? (
              <div
                data-reveal=""
                role="note"
                className="flex items-start gap-3 rounded-card border border-notice-border bg-notice-bg px-4 py-3.5 text-sm leading-[1.9] text-notice-fg"
              >
                <DemoBadge className="shrink-0" />
                <span>
                  این دوره نمونه نمایشی است؛ شرح، سرفصل‌ها و زمان برگزاری پس از تأیید برنامه آموزشی
                  جایگزین می‌شود.
                </span>
              </div>
            ) : null}
            <section aria-labelledby="c-about" data-reveal="">
              <h2 id="c-about" className={sectionTitle}>
                درباره دوره
              </h2>
              <p className="max-w-3xl text-[17px] leading-[2.1] text-ink-3">{course.summary}</p>
            </section>
            <section aria-label="شرح دوره" data-reveal="">
              <MarkdownBody source={course.description} variant="outline" />
            </section>
            {course.instructor?.bio ? (
              <section aria-labelledby="instructor" data-reveal="">
                <h2 id="instructor" className={sectionTitle}>
                  درباره مدرس
                </h2>
                <p className="font-bold text-ink">
                  {course.instructor.name}
                  {course.instructor.title ? (
                    <span className="font-normal text-ink-3"> · {course.instructor.title}</span>
                  ) : null}
                </p>
                <p className="mt-2 max-w-3xl text-[15px] leading-loose text-ink-3">
                  {course.instructor.bio}
                </p>
              </section>
            ) : null}
            {others.length > 0 ? (
              <section aria-labelledby="c-rel" data-reveal="">
                <div className="mb-5 flex items-baseline justify-between gap-4">
                  <h2 id="c-rel" className={sectionTitle.replace('mb-5 ', '')}>
                    دوره‌های مرتبط
                  </h2>
                  <Link href="/training" className={sectionLinkClasses('text-sm')}>
                    همه دوره‌ها ‹
                  </Link>
                </div>
                <div
                  data-stagger="80"
                  className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-4"
                >
                  {others.map((c) => (
                    <div key={c.id} data-reveal="">
                      <CourseCard course={c} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </article>

          <aside
            aria-label="مشخصات دوره"
            className="min-[980px]:sticky min-[980px]:top-[calc(var(--header-offset,72px)+24px)]"
          >
            <div
              data-surface="dark"
              data-reveal=""
              className="relative overflow-hidden rounded-tile border border-line bg-brand-700 shadow-form"
            >
              <div
                aria-hidden="true"
                className="relative h-[120px] overflow-hidden bg-linear-155 from-primary-soft via-copper-shade-1 via-60% to-copper-shade-2"
              >
                <div className="dots absolute inset-0 [--dot-color:color-mix(in_srgb,var(--color-accent)_25%,transparent)] [--dot-size:18px] [mask-image:radial-gradient(ellipse_at_20%_100%,#000,transparent_75%)]" />
                <span
                  data-anim="ping"
                  className="absolute top-[34px] left-9 size-[52px] rounded-full border border-accent/60"
                />
                <span className="absolute top-[54px] left-14 size-3 rounded-full bg-primary shadow-[0_0_18px_var(--color-primary)]" />
              </div>
              <div className="flex flex-col gap-[18px] p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[22px] font-black text-ink">{price}</span>
                  <span className="rounded-full bg-primary-soft px-2.5 py-[3px] text-xs font-bold whitespace-nowrap text-ink">
                    {course.startsAt
                      ? `شروع: ${formatDateFa(course.startsAt)}`
                      : 'زمان برگزاری: پس از اعلام'}
                  </span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-[14.5px]">
                  {facts.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-ink-5">{label}</dt>
                      <dd className="font-semibold text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
                <Link href={`${path}/enroll`} className={buttonClasses('cta', 'xl')}>
                  <Shine />
                  <span className="relative">اعلام علاقه‌مندی به دوره</span>
                </Link>
                {purchasable ? <BuyCourseButton slug={course.slug} /> : null}
                <p className="text-[13px] leading-relaxed text-ink-5">
                  پس از ثبت درخواست، کارشناسان آموزش برای هماهنگی ثبت‌نام با شما تماس می‌گیرند.
                </p>
                <Link
                  href="/contact"
                  className="text-center text-sm font-bold text-accent no-underline hover:text-ink"
                >
                  پرسش درباره دوره ‹
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
