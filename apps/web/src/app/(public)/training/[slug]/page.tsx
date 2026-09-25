import { buttonClasses, Container, DemoBadge, formatDateFa } from '@roshd/ui';
import { COURSE_LEVEL_LABELS_FA, DELIVERY_MODE_LABELS_FA } from '@roshd/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarkdownBody } from '@/components/content/markdown';
import {
  courseDurationLabel,
  coursePriceLabel,
  localCover,
} from '@/components/courses/course-format';
import { courseJsonLd, loadCourse } from '@/components/courses/course-pages';
import { PageIntro } from '@/components/layout/page-shell';
import { site } from '@/content/site';
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

export default async function CoursePage({ params }: { params: Params }) {
  const course = await loadCourse((await params).slug);
  const path = `/training/${course.slug}`;
  const duration = courseDurationLabel(course.durationHours);
  const facts: [string, string][] = [
    ['هزینه', coursePriceLabel(course)],
    ['سطح', COURSE_LEVEL_LABELS_FA[course.level]],
    ['نحوه برگزاری', DELIVERY_MODE_LABELS_FA[course.deliveryMode]],
  ];
  if (duration) facts.push(['مدت', duration]);
  if (course.startsAt) facts.push(['شروع', formatDateFa(course.startsAt)]);
  if (course.instructor) facts.push(['مدرس', course.instructor.name]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(courseJsonLd(course))}
      />
      <PageIntro
        path={path}
        crumb={course.title}
        parent={{ label: 'آموزش', href: '/training' }}
        eyebrow={course.category?.name ?? 'دوره آموزشی'}
        title={course.title}
        lead={course.summary}
      />
      <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-10 py-12">
        <div className="min-w-0 md:col-span-2">
          {course.isDemo ? <DemoBadge className="mb-6" /> : null}
          <MarkdownBody source={course.description} />
          {course.instructor?.bio ? (
            <section aria-labelledby="instructor" className="mt-12 max-w-3xl">
              <h2 id="instructor" className="mb-3 text-lg font-extrabold text-brand-900">
                درباره مدرس
              </h2>
              <p className="font-bold text-ink-2">
                {course.instructor.name}
                {course.instructor.title ? (
                  <span className="font-normal text-ink-4"> · {course.instructor.title}</span>
                ) : null}
              </p>
              <p className="mt-2 text-[15px] leading-loose text-ink-3">{course.instructor.bio}</p>
            </section>
          ) : null}
        </div>
        <aside
          aria-label="مشخصات دوره"
          className="flex flex-col gap-5 rounded-card border border-line-2 p-6"
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-[15px]">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ink-5">{label}</dt>
                <dd className="font-semibold text-ink-2">{value}</dd>
              </div>
            ))}
          </dl>
          <Link href={`${path}/enroll`} className={buttonClasses('primary', 'lg', 'no-underline')}>
            درخواست ثبت‌نام
          </Link>
          <p className="text-[13px] leading-relaxed text-ink-5">
            پس از ثبت درخواست، کارشناسان آموزش برای هماهنگی ثبت‌نام با شما تماس می‌گیرند.
          </p>
        </aside>
      </Container>
    </>
  );
}
