import { buttonClasses, cn, DemoBadge, ordinal, sectionLinkClasses, Shine, Tag } from '@roshd/ui';
import { INVESTMENT_SECTOR_LABELS_FA, PROJECT_STAGE_LABELS_FA } from '@roshd/validation';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { FloatingPaths } from '@/components/motion/floating-paths';
import {
  consultingServices,
  futureCapabilities,
  pastWorkSectors,
  processSteps,
} from '@/content/site';
import type { InvestmentSummary } from '@/lib/investment-api';

/** Eyebrow + display title + optional action, as used by every home section. */
export function HomeSectionHeader({
  id,
  eyebrow,
  title,
  action,
  size = 'lg',
  className,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  size?: 'lg' | 'md';
  className?: string;
}) {
  return (
    <div
      data-reveal=""
      className={cn('mb-9 flex flex-wrap items-end justify-between gap-4', className)}
    >
      <div>
        {eyebrow ? <p className="mb-2.5 text-sm font-bold text-accent">{eyebrow}</p> : null}
        <h2
          id={id}
          className={cn(
            'font-display leading-[1.4] font-extrabold text-ink',
            size === 'lg' ? 'text-[clamp(28px,3.4vw,42px)]' : 'text-[clamp(26px,3vw,36px)]',
          )}
        >
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

/* ───────────── Experience marquee (design Home §3) ───────────── */

function Pills({ duplicate }: { duplicate?: boolean }) {
  return (
    <ul
      data-dup={duplicate ? '' : undefined}
      aria-hidden={duplicate ? true : undefined}
      className="flex gap-3 py-1 pl-3"
    >
      {pastWorkSectors.map((item) => (
        <li
          key={item}
          className="flex h-11 items-center gap-2.5 rounded-full border border-line bg-brand-700 px-[18px] text-[15px] font-semibold whitespace-nowrap text-ink"
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ExperienceMarquee() {
  const edge =
    'absolute inset-y-0 w-[90px] backdrop-blur-[3px] [mask-image:linear-gradient(var(--edge-dir),#000,transparent)]';
  return (
    <section aria-labelledby="exp-title" className="border-b border-line bg-brand-700 pt-11 pb-12">
      <div className="mx-auto mb-[22px] flex max-w-(--container-page) items-center gap-3.5 px-6">
        <h2
          id="exp-title"
          className="font-display text-[15px] font-extrabold whitespace-nowrap text-ink"
        >
          حوزه‌های تجربه
        </h2>
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-linear-270 from-line-strong to-transparent"
        />
      </div>
      <div
        data-marquee=""
        role="group"
        tabIndex={0}
        aria-label="فهرست حوزه‌های تجربه"
        style={{ '--speed': '52s' } as CSSProperties}
        className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)] focus-visible:outline-offset-[-3px]"
      >
        <div data-track="" className="flex w-max">
          <Pills />
          <Pills duplicate />
        </div>
        <span
          aria-hidden="true"
          data-edge=""
          className={cn(edge, 'left-0')}
          style={{ '--edge-dir': '90deg' } as CSSProperties}
        />
        <span
          aria-hidden="true"
          data-edge=""
          className={cn(edge, 'right-0')}
          style={{ '--edge-dir': '270deg' } as CSSProperties}
        />
      </div>
    </section>
  );
}

/* ───────────── Consulting services on paper (design Home §6) ───────────── */

const SERVICE_ICONS = [
  'M3 17l6-6 4 4 8-8M15 7h6v6',
  'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  'M4 20V10M10 20V4M16 20v-7M22 20H2',
  'M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13zM15.5 15.5L21 21M8 10.5l2 2 3.5-3.5',
  'M3 21V10l6 4v-4l6 4V5h6v16zM3 21h18',
  'M4 6h9M4 12h16M4 18h7M17 5l2 2-2 2',
];

export function ServicesPaper() {
  return (
    <section
      aria-labelledby="services-title"
      data-surface="paper"
      className="relative overflow-hidden border-y border-paper-line"
    >
      <div
        aria-hidden="true"
        className="dots absolute inset-0 [--dot-color:var(--color-paper-line)] [--dot-size:24px] [mask-image:radial-gradient(ellipse_50%_60%_at_90%_0%,#000,transparent_70%)]"
      />
      <div className="relative mx-auto max-w-(--container-page) px-6 py-24">
        <HomeSectionHeader
          id="services-title"
          eyebrow="خدمات مشاوره"
          title="خدمات تخصصی"
          action={
            <Link href="/consulting" className={sectionLinkClasses()}>
              همه خدمات ‹
            </Link>
          }
        />
        <div
          data-stagger="70"
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4"
        >
          {consultingServices.map((service, i) => (
            <Link
              key={service.key}
              href="/consulting"
              data-reveal=""
              data-spotlight=""
              className="relative flex min-h-[200px] flex-col gap-3 overflow-hidden rounded-panel border border-paper-line bg-paper p-7 no-underline transition-[transform,border-color,box-shadow] duration-200 ease-enter hover:-translate-y-[3px] hover:border-copper-deep hover:shadow-[0_20px_44px_-28px_color-mix(in_srgb,var(--color-copper-deep)_50%,transparent)] focus-visible:border-copper-deep"
            >
              <span
                data-spot=""
                aria-hidden="true"
                className="spot"
                style={{ '--spot-color': 'var(--color-copper-deep)' } as CSSProperties}
              />
              <span
                aria-hidden="true"
                className="relative flex size-12 items-center justify-center rounded-panel border border-paper-line bg-paper-3"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-copper-deep)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={SERVICE_ICONS[i % SERVICE_ICONS.length]} />
                </svg>
              </span>
              <h3 className="relative mt-1 font-display text-[19px] font-extrabold text-ink">
                {service.title}
              </h3>
              <p className="relative text-[14.5px] leading-[1.95] text-pretty text-ink-3">
                {service.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────── Projects under study (design Home §7, table) ───────────── */

export function StudiedProjects({ projects }: { projects: InvestmentSummary[] }) {
  return (
    <section
      aria-labelledby="feas-title"
      className="mx-auto max-w-(--container-page) px-6 pt-24 pb-[72px]"
    >
      <HomeSectionHeader
        id="feas-title"
        eyebrow="امکان‌سنجی"
        title="طرح‌های در حال مطالعه"
        size="md"
        className="mb-6"
        action={projects.some((p) => p.isDemo) ? <DemoBadge size="lg" /> : undefined}
      />
      <div
        role="table"
        aria-label="طرح‌های در حال مطالعه"
        data-stagger="80"
        className="border-t-2 border-brand-950"
      >
        {projects.map((p) => (
          <div
            key={p.id}
            role="row"
            data-reveal=""
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] items-center gap-x-6 gap-y-3 rounded-control border-b border-line px-3 py-[22px] transition-colors duration-200 hover:bg-brand-700"
          >
            <div role="cell" className="col-span-2 min-w-0">
              <span className="mb-1 block text-[13px] font-bold text-accent">
                {INVESTMENT_SECTOR_LABELS_FA[p.sector]}
              </span>
              <Link
                href={`/investment/${p.slug}`}
                className="text-[17px] font-bold text-ink no-underline hover:text-accent"
              >
                {p.title}
              </Link>
            </div>
            <div role="cell" className="text-sm text-ink-3">
              <span className="text-ink-5">موقعیت: </span>
              {p.province ?? '—'}
            </div>
            <div role="cell" className="text-sm text-ink-3">
              <span className="text-ink-5">مرحله: </span>
              {PROJECT_STAGE_LABELS_FA[p.stage]}
            </div>
            <div role="cell" className="text-sm text-ink-3">
              <span className="text-ink-5">خدمت: </span>
              {p.serviceNeeded ?? '—'}
            </div>
            <div role="cell">
              <Link
                href="/feasibility/request"
                className="text-sm font-bold text-accent no-underline hover:text-ink"
              >
                درخواست مشابه ‹
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────── Process rail (design Home §8) ───────────── */

export function ProcessRail() {
  return (
    <section
      data-rail="auto"
      aria-labelledby="process-title"
      className="relative overflow-hidden bg-brand-950 text-ink"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="dots absolute inset-0 [--dot-color:color-mix(in_srgb,var(--color-accent)_14%,transparent)] [--dot-size:26px] [mask-image:radial-gradient(ellipse_70%_80%_at_50%_0%,#000,transparent_75%)]" />
        <div className="absolute -inset-x-[10%] -bottom-1/2 h-[80%] bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_srgb,var(--color-primary)_45%,transparent),transparent_70%)] blur-[30px]" />
      </div>
      <div className="relative mx-auto max-w-(--container-page) px-6 py-[104px]">
        <HomeSectionHeader
          id="process-title"
          eyebrow="فرایند انجام کار"
          title="از ثبت درخواست تا تحویل"
          className="mb-14"
        />
        {/* Wide: horizontal rail */}
        <div data-rail-group="" className="relative hidden lg:block">
          <div
            aria-hidden="true"
            className="absolute top-[23px] right-6 left-[calc(20%-43.2px)] h-0.5 rounded-sm bg-accent/18"
          >
            <div
              data-rail-fill="x"
              className="absolute inset-0 rounded-sm bg-linear-270 from-primary to-accent shadow-[0_0_14px_color-mix(in_srgb,var(--color-primary)_70%,transparent)]"
            />
          </div>
          <ol className="relative grid grid-cols-5 gap-6">
            {processSteps.map((step, i) => (
              <li key={step.title} data-step="" className="relative flex flex-col gap-3">
                <span
                  data-dot=""
                  className="flex size-12 items-center justify-center rounded-full border-2 border-accent text-lg font-black"
                >
                  {ordinal(i)}
                </span>
                <h3 className="mt-2 font-display text-[19px] font-extrabold text-ink">
                  {step.title}
                </h3>
                <p className="text-[14.5px] leading-[1.95] text-ink-3">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
        {/* Narrow: vertical rail */}
        <div data-rail-group="" className="relative pr-16 lg:hidden">
          <div
            aria-hidden="true"
            className="absolute top-6 right-[23px] bottom-6 w-0.5 rounded-sm bg-accent/18"
          >
            <div
              data-rail-fill="y"
              className="absolute inset-0 rounded-sm bg-linear-180 from-primary to-accent"
            />
          </div>
          <ol className="relative flex flex-col gap-8">
            {processSteps.map((step, i) => (
              <li key={step.title} data-step="" className="relative flex min-h-12 flex-col gap-1.5">
                <span
                  data-dot=""
                  className="absolute top-0 -right-16 flex size-12 items-center justify-center rounded-full border-2 border-accent text-lg font-black"
                >
                  {ordinal(i)}
                </span>
                <h3 className="mt-2.5 font-display text-lg font-extrabold text-ink">
                  {step.title}
                </h3>
                <p className="text-[14.5px] leading-[1.95] text-ink-3">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
        <Link
          href="/feasibility/request"
          data-reveal=""
          className="mt-14 inline-flex h-[54px] items-center gap-2.5 rounded-control bg-primary px-[26px] font-extrabold whitespace-nowrap text-on-primary no-underline transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:text-on-primary hover:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent)_30%,transparent)]"
        >
          شروع با ثبت درخواست امکان‌سنجی <span aria-hidden="true">‹</span>
        </Link>
      </div>
    </section>
  );
}

/* ───────────── Future capabilities (design Home §9) ───────────── */

function LockIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      className="text-ink-5"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

export function FutureCapabilities() {
  return (
    <section
      aria-labelledby="future-title"
      className="mx-auto max-w-(--container-page) px-6 pt-24 pb-[72px]"
    >
      <div data-reveal="" className="mb-3 flex flex-wrap items-center gap-3">
        <h2
          id="future-title"
          className="font-display text-[clamp(24px,2.6vw,32px)] font-extrabold text-ink"
        >
          قابلیت‌های توسعه آینده
        </h2>
        <Tag>هنوز در دسترس نیست</Tag>
      </div>
      <p data-reveal="" className="mb-7 max-w-[720px] text-[15px] leading-loose text-ink-3">
        این قابلیت‌ها در نقشه راه توسعه پلتفرم قرار دارند و در نسخه فعلی ارائه نمی‌شوند.
      </p>
      <ul
        data-stagger="70"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3"
      >
        {futureCapabilities.map((item) => (
          <li
            key={item.title}
            data-reveal=""
            className="relative flex flex-col gap-2.5 overflow-hidden rounded-panel border border-dashed border-line-strong bg-brand-700 p-5"
          >
            <span
              data-anim="shimmer-slow"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-linear-90 from-transparent via-primary/8 to-transparent"
            />
            <div className="relative flex items-center justify-between">
              <LockIcon />
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11.5px] font-bold text-ink">
                به‌زودی
              </span>
            </div>
            <h3 className="relative font-display text-base font-bold text-ink">{item.title}</h3>
            <p className="relative text-[13px] leading-[1.9] text-ink-3">{item.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────── Final CTA (design Home §10) ───────────── */

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="px-6 pb-[104px]">
      <div
        data-reveal=""
        className="relative mx-auto max-w-(--container-page) overflow-hidden rounded-feature border border-line bg-brand-800 px-[clamp(24px,5vw,72px)] py-[clamp(48px,8vw,112px)] text-center"
      >
        <FloatingPaths className="pointer-events-none absolute inset-0 size-full -scale-x-100 text-primary" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_48%_62%_at_50%_50%,color-mix(in_srgb,var(--color-brand-800)_94%,transparent),transparent)]"
        />
        <div className="relative flex flex-col items-center gap-[22px]">
          <p className="inline-flex h-8 items-center gap-2 rounded-full border border-line-strong bg-brand-700 px-3.5 text-sm font-bold whitespace-nowrap text-accent">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
            مشاوره، امکان‌سنجی و پژوهش
          </p>
          <h2
            id="cta-title"
            className="max-w-[760px] font-display text-[clamp(28px,3.6vw,46px)] leading-[1.45] font-extrabold text-balance text-ink"
          >
            طرح یا پرسشی دارید؟ با کارشناسان ما در ارتباط باشید.
          </h2>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className={buttonClasses('cta', 'lg')}>
              <Shine />
              <span className="relative">درخواست مشاوره</span>
            </Link>
            <Link href="/feasibility/request" className={buttonClasses('secondary', 'lg')}>
              ثبت پروژه برای امکان‌سنجی
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
