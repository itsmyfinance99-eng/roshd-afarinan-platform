import { cn, DemoBadge, formatDateFa } from '@roshd/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  COURSE_LEVEL_LABELS_FA,
  INVESTMENT_SECTOR_LABELS_FA,
  PROJECT_STAGE_LABELS_FA,
} from '@roshd/validation';
import {
  courseDurationLabel,
  coursePriceLabel,
  localCover,
} from '@/components/courses/course-format';
import type { EntryCardData } from '@/content/types';
import type { InvestmentSummary } from '@/lib/investment-api';
import type { CourseSummary } from '@/lib/learning-api';

/*
 * Cards (design CourseCard / ProjectCard / ContentCard). Each card is an <article> whose
 * title link stretches over the whole card (one tab stop, accessible name = title); the
 * cursor spotlight, the −3px lift and the copper focus glow follow the design.
 */
const cardShell =
  'group/card relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-brand-700 transition-[transform,border-color,box-shadow] duration-200 ease-enter hover:border-primary hover:shadow-card has-[a[data-stretch]:focus-visible]:border-primary has-[a[data-stretch]:focus-visible]:shadow-glow';

/** Title link covering the card; the focus ring is drawn by the card (has-focus-visible). */
const stretched =
  'text-ink no-underline outline-none after:absolute after:inset-0 after:z-[3] hover:text-ink focus-visible:outline-none';

/** Cursor spotlight overlay; `raised` puts it over the media slot (design z-index 1). */
function Spot({ size = 320, raised = true }: { size?: number; raised?: boolean }) {
  return (
    <span
      data-spot=""
      aria-hidden="true"
      className={cn('spot', raised && 'z-[1]')}
      style={{ ['--spot-size' as string]: `${size}px` }}
    />
  );
}

function BookIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M8 16h20a4 4 0 014 4v32a4 4 0 00-4-4H8z" />
      <path d="M56 16H36a4 4 0 00-4 4v32a4 4 0 014-4h20z" />
    </svg>
  );
}

function FactoryIcon() {
  return (
    <svg
      width="72"
      height="56"
      viewBox="0 0 72 56"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M4 52V26l14 8V26l14 8V14h12v38z" />
      <path d="M50 52V30h18v22M4 52h64M56 36h6M56 42h6" />
    </svg>
  );
}

/** 16:9 media slot: the cover when there is one, otherwise the patterned placeholder. */
function Media({
  cover,
  label,
  pattern,
  icon,
  children,
}: {
  cover: string | null;
  label: string;
  pattern: 'grid' | 'dots';
  icon: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="relative aspect-video overflow-hidden bg-brand-800">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- CMS-managed path, size unknown
        <img
          data-zoom=""
          src={cover}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div
          data-zoom=""
          role="img"
          aria-label={`جای ${label}`}
          className={cn(
            'absolute inset-0 flex items-center justify-center text-steel/60',
            pattern === 'grid'
              ? 'bg-[linear-gradient(var(--color-graphite-600)_1px,transparent_1px),linear-gradient(90deg,var(--color-graphite-600)_1px,transparent_1px),linear-gradient(135deg,var(--color-brand-700),var(--color-brand-800))] bg-size-[24px_24px,24px_24px,100%_100%]'
              : 'bg-[radial-gradient(var(--color-line)_1px,transparent_1.2px),linear-gradient(160deg,var(--color-brand-700),var(--color-brand-800))] bg-size-[18px_18px,100%_100%]',
          )}
        >
          {icon}
        </div>
      )}
      {children}
    </div>
  );
}

export function CourseCard({
  course,
  headingLevel = 3,
}: {
  course: CourseSummary;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const duration = courseDurationLabel(course.durationHours);
  return (
    <article data-spotlight="" className={cn(cardShell, 'hover:-translate-y-[3px]')}>
      <Spot />
      <Media
        cover={localCover(course.coverImageUrl)}
        label="تصویر دوره"
        pattern="grid"
        icon={<BookIcon />}
      >
        <div className="absolute inset-x-3 top-3 z-[2] flex justify-between gap-2">
          <span className="rounded-chip border border-line bg-brand-700 px-2 py-[3px] text-xs font-bold text-ink">
            {coursePriceLabel(course)}
          </span>
          {course.isDemo ? <DemoBadge /> : null}
        </div>
      </Media>
      <div className="relative z-[2] flex flex-1 flex-col gap-2.5 p-5">
        {course.category ? (
          <span className="text-[13px] font-bold text-accent">{course.category.name}</span>
        ) : null}
        <Heading className="font-display text-[17px] leading-[1.7] font-bold text-pretty text-ink">
          <Link href={`/training/${course.slug}`} data-stretch="" className={stretched}>
            {course.title}
          </Link>
        </Heading>
        {course.instructor ? <p className="text-sm text-ink-3">{course.instructor.name}</p> : null}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-graphite-600 pt-3.5 text-[13px] text-ink-3">
          <span>سطح: {COURSE_LEVEL_LABELS_FA[course.level]}</span>
          {duration ? <span>مدت: {duration}</span> : null}
        </div>
      </div>
    </article>
  );
}

export function ProjectCard({
  project,
  headingLevel = 3,
}: {
  project: InvestmentSummary;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <article data-spotlight="" className={cn(cardShell, 'hover:-translate-y-[3px]')}>
      <Spot />
      <Media
        cover={localCover(project.coverImageUrl)}
        label="تصویر پروژه"
        pattern="dots"
        icon={<FactoryIcon />}
      >
        {project.isDemo ? <DemoBadge className="absolute top-3 right-3 z-[2]" /> : null}
      </Media>
      <div className="relative z-[2] flex flex-1 flex-col gap-3.5 p-5">
        <span className="text-[13px] font-bold text-accent">
          {INVESTMENT_SECTOR_LABELS_FA[project.sector]}
        </span>
        <Heading className="font-display text-[17px] leading-[1.7] font-bold text-pretty text-ink">
          <Link href={`/investment/${project.slug}`} data-stretch="" className={stretched}>
            {project.title}
          </Link>
        </Heading>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-sm">
          <dt className="whitespace-nowrap text-ink-5">موقعیت</dt>
          <dd className="text-ink">{project.province ?? '—'}</dd>
          <dt className="whitespace-nowrap text-ink-5">مرحله</dt>
          <dd className="text-ink">{PROJECT_STAGE_LABELS_FA[project.stage]}</dd>
          <dt className="whitespace-nowrap text-ink-5">خدمت مورد نیاز</dt>
          <dd className="text-ink">{project.serviceNeeded ?? '—'}</dd>
        </dl>
        {/* Above the stretched title link, so it stays its own target. */}
        <Link
          href={`/investment/${project.slug}/interest`}
          aria-label={`درخواست بررسی: ${project.title}`}
          className="relative z-[4] mt-auto flex h-11 items-center justify-center rounded-control border border-primary text-sm font-bold text-accent no-underline transition-colors hover:bg-primary hover:text-on-primary"
        >
          درخواست بررسی
        </Link>
      </div>
    </article>
  );
}

/**
 * Article / knowledge / research card. With `href` the title links (stretched) to the detail
 * page and the CTA text sits at the bottom; demo entries without a page render unlinked.
 * `media` adds the 16:9 image slot above the text (design Articles).
 */
export function ContentCard({
  item,
  cta = 'مطالعه',
  href,
  note,
  media,
  headingLevel = 3,
}: {
  item: EntryCardData;
  cta?: string;
  href?: string;
  /** Shown instead of the date, e.g. «سال ۱۴۰۳». */
  note?: string;
  media?: { cover: string | null; label: string };
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const body = (
    <>
      <div className="relative flex items-center justify-between gap-3 text-[13px]">
        <span className="font-bold text-accent">{item.category}</span>
        <span className="flex items-center gap-2">
          {item.isDemo ? <DemoBadge size="sm" /> : null}
          {note ? (
            <span className="text-ink-5">{note}</span>
          ) : item.date ? (
            <time dateTime={item.date} className="text-ink-5">
              {formatDateFa(item.date)}
            </time>
          ) : null}
        </span>
      </div>
      <Heading className="relative font-display text-[17px] leading-[1.7] font-bold text-pretty text-ink">
        {href ? (
          <Link href={href} data-stretch="" className={stretched}>
            {item.title}
          </Link>
        ) : (
          item.title
        )}
      </Heading>
      {item.summary ? (
        <p className="relative text-sm leading-[1.9] text-pretty text-ink-3">{item.summary}</p>
      ) : null}
      {href ? (
        <span
          aria-hidden="true"
          className="relative mt-auto pt-1.5 text-sm font-bold text-accent transition-colors group-hover/card:text-ink"
        >
          {cta} ‹
        </span>
      ) : null}
    </>
  );
  if (media) {
    return (
      <article data-spotlight="" className={cn(cardShell, 'hover:-translate-y-0.5')}>
        <Spot size={300} />
        <div className="relative aspect-video overflow-hidden bg-brand-800">
          {localCover(media.cover) ? (
            // eslint-disable-next-line @next/next/no-img-element -- CMS-managed path, size unknown
            <img
              data-zoom=""
              src={localCover(media.cover) ?? ''}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div
              data-zoom=""
              role="img"
              aria-label={`جای ${media.label}`}
              className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,var(--color-graphite-600)_0_10px,var(--color-brand-700)_10px_20px)] font-mono text-xs text-ink-5"
            >
              {media.label}
            </div>
          )}
        </div>
        <div className="relative z-[2] flex flex-1 flex-col gap-2.5 p-[22px]">{body}</div>
      </article>
    );
  }
  return (
    <article data-spotlight="" className={cn(cardShell, 'gap-2.5 p-[22px] hover:-translate-y-0.5')}>
      <Spot size={300} raised={false} />
      {body}
    </article>
  );
}
