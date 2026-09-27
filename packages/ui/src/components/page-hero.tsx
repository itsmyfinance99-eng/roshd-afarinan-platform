import type { ReactNode } from 'react';

export interface Crumb {
  label: string;
  href?: string;
}

/** Inner-page hero: breadcrumb, eyebrow, title, lead on a subtle grid background. */
export function PageHero({
  crumbs,
  eyebrow,
  title,
  lead,
  children,
}: {
  crumbs: Crumb[];
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-surface">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(#e6ebf3_1px,transparent_1px),linear-gradient(90deg,#e6ebf3_1px,transparent_1px)] bg-size-[48px_48px] opacity-60"
      />
      <div className="relative mx-auto max-w-(--container-page) px-6 pt-7 pb-14">
        <nav aria-label="مسیر صفحه" className="text-[13px] text-ink-5">
          <ol className="flex flex-wrap items-center gap-2">
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-2">
                  {last || !crumb.href ? (
                    <span aria-current={last ? 'page' : undefined} className="text-ink-2">
                      {crumb.label}
                    </span>
                  ) : (
                    <a href={crumb.href} className="text-primary no-underline">
                      {crumb.label}
                    </a>
                  )}
                  {last ? null : <span aria-hidden="true">‹</span>}
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="mt-10 max-w-[760px]">
          {eyebrow ? <p className="mb-3 text-sm font-bold text-primary">{eyebrow}</p> : null}
          <h1 className="text-[clamp(30px,4vw,46px)] leading-[1.35] font-extrabold text-balance text-brand-900">
            {title}
          </h1>
          {lead ? (
            <p className="mt-[18px] text-[clamp(16px,1.6vw,18px)] leading-loose text-pretty text-ink-3">
              {lead}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </section>
  );
}
