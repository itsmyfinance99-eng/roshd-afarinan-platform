import type { ReactNode } from 'react';
import { RevealWords } from './reveal-words';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Inner-page hero (design PageHero): graphite band with a masked dot texture, copper haze and
 * a pinging ring; breadcrumb, eyebrow with a copper dash, display h1 and a lead revealed word
 * by word. Pass `lead` as a string for the word reveal; other nodes render as-is.
 */
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
    <section className="relative flex min-h-[clamp(300px,40vh,440px)] items-end overflow-hidden border-b border-line bg-brand-800">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="dots absolute inset-0 [--dot-color:var(--color-line)] [mask-image:radial-gradient(ellipse_65%_90%_at_20%_10%,#000_20%,transparent_72%)]" />
        <div className="absolute top-[-40%] left-[-10%] h-[120%] w-[60%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-primary)_14%,transparent),transparent)] blur-[20px]" />
        <div className="absolute top-[26%] left-[14%] size-[140px] max-sm:hidden">
          <span
            data-anim="ping"
            className="absolute inset-0 rounded-full border border-primary/35"
          />
          <span className="absolute top-1/2 left-1/2 -mt-1 -ml-1 size-2 rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_18%,transparent)]" />
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-(--container-page) px-6 pt-7 pb-14">
        <nav
          aria-label="مسیر صفحه"
          data-reveal=""
          data-dur="500"
          className="text-[13px] text-ink-5"
        >
          <ol className="flex flex-wrap items-center gap-2">
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-2">
                  {last || !crumb.href ? (
                    <span aria-current={last ? 'page' : undefined} className="text-ink">
                      {crumb.label}
                    </span>
                  ) : (
                    <a
                      href={crumb.href}
                      className="inline-block py-1 text-accent no-underline hover:text-ink"
                    >
                      {crumb.label}
                    </a>
                  )}
                  {last ? null : <span aria-hidden="true">‹</span>}
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="mt-11 max-w-[780px]">
          {eyebrow ? (
            <p
              data-reveal=""
              data-delay="60"
              className="mb-3.5 inline-flex items-center gap-2 text-sm font-bold text-accent"
            >
              <span aria-hidden="true" className="h-0.5 w-[18px] rounded-sm bg-primary" />
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-[clamp(30px,4vw,48px)] leading-[1.4] font-extrabold text-balance text-ink">
            {title}
          </h1>
          {lead ? (
            <p
              data-reveal={typeof lead === 'string' ? 'words' : ''}
              data-delay="160"
              className="mt-[18px] text-[clamp(16px,1.6vw,18px)] leading-loose text-pretty text-ink-3"
            >
              {typeof lead === 'string' ? <RevealWords text={lead} /> : lead}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </section>
  );
}
