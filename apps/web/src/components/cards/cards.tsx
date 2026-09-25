import { DemoBadge, formatDateFa, ImagePlaceholder } from '@roshd/ui';
import Link from 'next/link';
import { COURSE_LEVEL_LABELS_FA, DELIVERY_MODE_LABELS_FA } from '@roshd/validation';
import {
  courseDurationLabel,
  coursePriceLabel,
  localCover,
} from '@/components/courses/course-format';
import type { DemoProject, EntryCardData } from '@/content/types';
import type { CourseSummary } from '@/lib/learning-api';

export function CourseCard({ course }: { course: CourseSummary }) {
  const href = `/training/${course.slug}`;
  const cover = localCover(course.coverImageUrl);
  const duration = courseDurationLabel(course.durationHours);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-white hover:border-line-hover">
      <div className="relative">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- CMS-managed path, size unknown
          <img src={cover} alt="" className="aspect-video w-full object-cover" loading="lazy" />
        ) : (
          <ImagePlaceholder label="کاور دوره" className="aspect-video" />
        )}
        <span className="absolute top-3 start-3 rounded-chip border border-line bg-white px-2 py-[3px] text-xs font-bold text-ink">
          {coursePriceLabel(course)}
        </span>
        {course.isDemo ? <DemoBadge className="absolute top-3 end-3" /> : null}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        {course.category ? (
          <span className="text-[13px] font-bold text-primary">{course.category.name}</span>
        ) : null}
        <h3 className="text-[17px] leading-[1.7] text-pretty text-ink">
          <Link href={href} className="text-ink no-underline hover:text-primary">
            {course.title}
          </Link>
        </h3>
        {course.instructor ? <p className="text-sm text-ink-4">{course.instructor.name}</p> : null}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-line-2 pt-3.5 text-[13px] text-ink-3">
          <span>سطح: {COURSE_LEVEL_LABELS_FA[course.level]}</span>
          {duration ? <span>مدت: {duration}</span> : null}
          <span>{DELIVERY_MODE_LABELS_FA[course.deliveryMode]}</span>
        </div>
      </div>
    </article>
  );
}

/** `href` is optional: demo entries have no detail page until the CMS (EPIC-03) publishes them. */
export function ContentCard({
  item,
  cta,
  href,
}: {
  item: EntryCardData;
  cta?: string;
  href?: string;
}) {
  return (
    <article className="flex h-full flex-col gap-2.5 rounded-card border border-line bg-white p-[22px] hover:border-line-hover">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="font-bold text-primary">{item.category}</span>
        <span className="flex items-center gap-2">
          {item.isDemo ? <DemoBadge /> : null}
          <time dateTime={item.date} className="text-ink-5">
            {formatDateFa(item.date)}
          </time>
        </span>
      </div>
      <h3 className="text-[17px] leading-[1.7] text-pretty text-ink">{item.title}</h3>
      <p className="text-sm leading-[1.9] text-pretty text-ink-4">{item.summary}</p>
      {href && cta ? (
        <Link
          href={href}
          className="mt-auto pt-1.5 text-sm font-bold text-primary no-underline hover:text-brand-900"
        >
          {cta} ‹
        </Link>
      ) : null}
    </article>
  );
}

export function ProjectCard({ project }: { project: DemoProject }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-white hover:border-line-hover">
      <div className="relative">
        <ImagePlaceholder label="تصویر پروژه" className="aspect-video" />
        {project.isDemo ? <DemoBadge className="absolute top-3 start-3" /> : null}
      </div>
      <div className="flex flex-1 flex-col gap-3.5 p-5">
        <span className="text-[13px] font-bold text-primary">{project.sectorLabel}</span>
        <h3 className="text-[17px] leading-[1.7] text-pretty text-ink">{project.title}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-sm">
          <dt className="text-ink-5">موقعیت</dt>
          <dd className="text-ink-2">{project.location}</dd>
          <dt className="text-ink-5">مرحله</dt>
          <dd className="text-ink-2">{project.stage}</dd>
          <dt className="text-ink-5">خدمت مورد نیاز</dt>
          <dd className="text-ink-2">{project.service}</dd>
        </dl>
        <Link
          href="/feasibility/request"
          className="mt-auto flex h-11 items-center justify-center rounded-control border border-primary text-sm font-bold text-primary no-underline hover:bg-primary hover:text-white"
        >
          درخواست بررسی
        </Link>
      </div>
    </article>
  );
}
