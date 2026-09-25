import { DemoBadge, formatDateFa, ImagePlaceholder } from '@roshd/ui';
import Link from 'next/link';
import type { DemoCourse, DemoEntry, DemoProject } from '@/content/types';

export function CourseCard({ course }: { course: DemoCourse }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-white hover:border-line-hover">
      <div className="relative">
        <ImagePlaceholder label="کاور دوره" className="aspect-video" />
        <span className="absolute top-3 start-3 rounded-chip border border-line bg-white px-2 py-[3px] text-xs font-bold text-ink">
          {course.free ? 'رایگان' : 'غیررایگان'}
        </span>
        {course.isDemo ? <DemoBadge className="absolute top-3 end-3" /> : null}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <span className="text-[13px] font-bold text-primary">{course.category}</span>
        <h3 className="text-[17px] leading-[1.7] text-pretty text-ink">{course.title}</h3>
        <p className="text-sm text-ink-4">{course.instructor}</p>
        <div className="mt-auto flex gap-4 border-t border-[#eef1f5] pt-3.5 text-[13px] text-ink-3">
          <span>سطح: {course.level}</span>
          <span>مدت: {course.duration}</span>
        </div>
      </div>
    </article>
  );
}

export function ContentCard({ item, cta, href }: { item: DemoEntry; cta: string; href: string }) {
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
      <Link
        href={href}
        className="mt-auto pt-1.5 text-sm font-bold text-primary no-underline hover:text-brand-900"
      >
        {cta} ‹
      </Link>
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
