import { buttonClasses, cn, ordinal, Shine } from '@roshd/ui';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { SonarGrid } from '@/components/motion/sonar-grid';
import { TextLoop } from '@/components/motion/text-loop';
import { Ticker } from '@/components/motion/ticker';
import { EMPHASISED_PATH_STEPS, hero, pathSteps } from '@/content/site';
import { WaveUnderline } from './wave-underline';

/**
 * Hero background (design Home `hero` prop): 'A' sonar grid on flat graphite, 'B' graphite
 * gradient with drifting copper haze and a horizon light. The handoff's default is B; the
 * review switcher is not shipped (design/INTEGRATION.md D9).
 */
export const HERO_VARIANT: 'A' | 'B' = 'B';

/** Golden-spiral path of the journey figure (viewBox 0 0 100 84), copied from the design. */
const SPIRAL =
  'M46.51 49.79 L47.17 49.83 L47.83 49.93 L48.5 50.08 L49.18 50.3 L49.85 50.58 L50.51 50.93 L51.16 51.34 L51.78 51.81 L52.38 52.35 L52.94 52.96 L53.47 53.62 L53.95 54.35 L54.37 55.13 L54.74 55.97 L55.05 56.86 L55.28 57.8 L55.44 58.78 L55.52 59.79 L55.51 60.84 L55.41 61.9 L55.22 62.98 L54.92 64.07 L54.53 65.16 L54.04 66.24 L53.44 67.3 L52.73 68.33 L51.92 69.33 L51.01 70.28 L49.99 71.17 L48.87 71.99 L47.66 72.73 L46.35 73.39 L44.96 73.94 L43.49 74.39 L41.94 74.72 L40.34 74.93 L38.68 75 L36.97 74.93 L35.24 74.71 L33.48 74.33 L31.72 73.8 L29.96 73.1 L28.22 72.23 L26.52 71.19 L24.87 69.98 L23.29 68.6 L21.79 67.06 L20.4 65.35 L19.11 63.47 L17.97 61.45 L16.97 59.28 L16.13 56.98 L15.48 54.55 L15.02 52.01 L14.78 49.37 L14.75 46.66 L14.96 43.88 L15.41 41.05 L16.12 38.2 L17.09 35.35 L18.33 32.52 L19.85 29.73 L21.64 27.01 L23.7 24.38 L26.04 21.87 L28.65 19.51 L31.52 17.32 L34.65 15.33 L38.02 13.56 L41.61 12.05 L45.42 10.81 L49.43 9.88 L53.6 9.27 L57.92 9.01 L62.36 9.11 L66.89 9.61 L71.48 10.5 L76.1 11.82 L80.71 13.56 L85.27 15.74';

type Side = 'l' | 'r' | 'b' | 'b2' | 'dl';

/** Node positions on the spiral (percent of the figure) and where each label chip sits. */
const NODES: Array<[number, number, Side]> = [
  [46.51, 59.27, 'l'],
  [54.21, 78.43, 'r'],
  [36.97, 89.2, 'b'],
  [18.72, 74.79, 'b'],
  [15.41, 48.87, 'r'],
  [27.75, 24.14, 'dl'],
  [52.19, 11.23, 'b'],
  [83.75, 17.81, 'b2'],
];

const CHIP_SIDE: Record<Side, string> = {
  b2: 'left-1/2 top-8 -translate-x-1/2',
  dl: 'left-4 top-1.5',
  l: 'right-[34px] top-1/2 -translate-y-1/2',
  r: 'left-3.5 top-1/2 -translate-y-1/2',
  b: 'left-1/2 top-4 -translate-x-1/2',
};

const emphasisedDot =
  'border-primary-soft bg-primary shadow-[0_0_0_2px_var(--color-primary),0_0_0_10px_color-mix(in_srgb,var(--color-primary)_14%,transparent),0_0_22px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]';

function Backdrop() {
  const B = HERO_VARIANT === 'B';
  return (
    <>
      <SonarGrid
        dot={B ? '--color-line-3' : '--color-graphite-400'}
        ring="--color-primary"
        alpha={B ? 0.35 : 0.32}
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0',
          B
            ? 'bg-[radial-gradient(ellipse_60%_70%_at_85%_40%,color-mix(in_srgb,var(--color-brand-950)_90%,transparent),transparent_70%)]'
            : 'bg-[radial-gradient(ellipse_55%_70%_at_85%_45%,color-mix(in_srgb,var(--color-brand-900)_95%,transparent),transparent_70%)]',
        )}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {B ? (
          <>
            <div
              data-anim="drift"
              className="absolute top-[-30%] left-[-8%] h-[90%] w-[62%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-primary)_10%,transparent),transparent)] blur-[40px]"
            />
            <div
              data-anim="drift"
              style={{ animationDelay: '-9s' }}
              className="absolute top-[-40%] left-[28%] h-[80%] w-1/2 bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-steel)_8%,transparent),transparent)] blur-[50px]"
            />
            <div
              data-anim="breathe"
              className="absolute -inset-x-[20%] bottom-[-46%] h-[70%] bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_srgb,var(--color-primary)_38%,transparent),color-mix(in_srgb,var(--color-copper-deep)_16%,transparent)_45%,transparent_70%)] blur-[24px]"
            />
            <div className="absolute inset-x-0 bottom-[22%] h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--color-accent)_70%,transparent)_30%,var(--color-accent-soft)_50%,color-mix(in_srgb,var(--color-accent)_70%,transparent)_70%,transparent)]" />
          </>
        ) : (
          <>
            <div
              data-anim="drift"
              className="absolute top-[-20%] left-[-6%] h-[85%] w-[55%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-primary)_8%,transparent),transparent)] blur-[40px]"
            />
            <div
              data-anim="drift"
              style={{ animationDelay: '-7s' }}
              className="absolute top-[30%] left-[24%] h-[75%] w-[45%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-steel)_6%,transparent),transparent)] blur-[50px]"
            />
          </>
        )}
      </div>
    </>
  );
}

function Stats() {
  const rule = 'border-line';
  return (
    <dl
      data-reveal=""
      data-delay="280"
      className={cn('mt-10 flex flex-wrap gap-y-5 border-t pt-6', rule)}
    >
      <div className={cn('me-7 flex flex-col border-e pe-7', rule)}>
        <dt className="order-2 text-sm text-ink-5">کارشناس</dt>
        <dd className="order-1 text-[32px] leading-[1.3] font-black text-ink">
          <Ticker to={50} prefix="+" />
        </dd>
      </div>
      <div className={cn('me-7 flex flex-col border-e pe-7', rule)}>
        <dt className="order-2 text-sm text-ink-5">حوزه اصلی فعالیت</dt>
        <dd className="order-1 text-center text-[32px] leading-[1.3] font-black text-ink">
          <Ticker to={3} />
        </dd>
      </div>
      <div className="flex flex-col">
        <dt className="order-2 text-center text-sm text-ink-5">آغاز فعالیت</dt>
        <dd className="order-1 text-[32px] leading-[1.3] font-black text-ink">
          <span className="relative inline-block">
            ۱۳۸۸
            <WaveUnderline delay={900} className="-bottom-1 h-3" strokeWidth={2.2} />
          </span>
        </dd>
      </div>
    </dl>
  );
}

/** Journey figure ≥1024px: the spiral is drawn, then the eight nodes pop in. */
function SpiralFigure() {
  return (
    <figure className="m-0 hidden rounded-feature border border-line bg-brand-800/78 px-6 pt-6 pb-11 shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_40px_80px_-40px_rgb(0_0_0/0.8)] backdrop-blur-[8px] lg:block">
      <figcaption className="flex items-center gap-2 text-sm font-bold text-ink-5">
        <span aria-hidden="true" className="h-0.5 w-[18px] rounded-sm bg-primary" />
        {hero.pathTitle}
      </figcaption>
      <div className="relative mt-2 aspect-[100/84]">
        <svg
          viewBox="0 0 100 84"
          aria-hidden="true"
          className="absolute inset-0 size-full overflow-visible"
        >
          <defs>
            <linearGradient id="raSpiral" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="var(--color-primary)" />
              <stop offset="1" stopColor="var(--color-accent)" />
            </linearGradient>
          </defs>
          <path
            d={SPIRAL}
            pathLength={1}
            data-draw=""
            data-delay="150"
            data-dur="950"
            fill="none"
            stroke="url(#raSpiral)"
            strokeWidth="0.55"
            strokeLinecap="round"
          />
        </svg>
        <ol>
          {pathSteps.map((label, i) => {
            const em = EMPHASISED_PATH_STEPS.includes(i);
            const [x, y, side] = NODES[i] ?? [0, 0, 'b'];
            const size = em ? 18 : 12;
            return (
              <li
                key={label}
                data-reveal="pop"
                data-delay={380 + i * 90}
                className="absolute size-0"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                {em ? (
                  <span
                    data-anim="pulse"
                    aria-hidden="true"
                    className="absolute top-0 left-0 size-[38px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary"
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]',
                    em ? emphasisedDot : 'border-steel bg-brand-800',
                  )}
                  style={{ width: size, height: size }}
                />
                <span
                  className={cn(
                    'absolute flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm whitespace-nowrap shadow-[0_6px_16px_-10px_rgb(0_0_0/0.45)]',
                    CHIP_SIDE[side],
                    em
                      ? 'border-primary-line bg-primary-soft font-extrabold text-accent'
                      : 'border-line bg-brand-700 font-semibold text-ink-3',
                  )}
                >
                  <span className="text-[11px] opacity-80">{ordinal(i)}.</span>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </figure>
  );
}

/** Below 1024px the journey is a vertical list with a growing line. */
function SpiralList() {
  return (
    <figure className="m-0 rounded-tile border border-line bg-brand-800/78 px-5 py-[22px] lg:hidden">
      <figcaption className="mb-3.5 text-sm font-bold text-ink-5">{hero.pathTitle}</figcaption>
      <ol data-stagger="70" className="relative flex flex-col gap-3.5 pr-[34px]">
        <span
          aria-hidden="true"
          data-reveal="grow-y"
          data-dur="1000"
          className="absolute top-2.5 right-2 bottom-2.5 w-0.5 rounded-sm bg-linear-180 from-primary to-accent"
        />
        {pathSteps.map((label, i) => {
          const em = EMPHASISED_PATH_STEPS.includes(i);
          const size = em ? 18 : 12;
          return (
            <li
              key={label}
              data-reveal=""
              className={cn(
                'relative flex items-center gap-2.5 text-base whitespace-nowrap text-ink',
                em ? 'font-extrabold' : 'font-semibold',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-1/2 -right-[34px] -translate-y-1/2 rounded-full border-[3px]',
                  em ? emphasisedDot : 'border-steel bg-brand-800',
                )}
                style={{ width: size, height: size, marginRight: em ? -3 : 0 } as CSSProperties}
              />
              <span className="text-xs text-ink-5">{ordinal(i)}.</span>
              {label}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

export function HomeHero() {
  const B = HERO_VARIANT === 'B';
  return (
    <section
      aria-labelledby="hero-title"
      className={cn(
        'relative overflow-hidden border-b border-line',
        B ? 'bg-linear-180 from-brand-950 via-brand-900 via-60% to-brand-800' : 'bg-brand-900',
      )}
    >
      <Backdrop />
      <div className="relative mx-auto grid max-w-(--container-page) grid-cols-[repeat(auto-fit,minmax(min(100%,480px),1fr))] items-center gap-12 px-6 pt-[calc(116px+clamp(28px,5vw,72px))] pb-[clamp(56px,7vw,96px)]">
        <div>
          <p
            data-reveal=""
            data-dur="500"
            className="mb-[22px] inline-flex h-[34px] max-w-full items-center gap-2.5 rounded-full border border-primary-line bg-primary/8 px-3.5 text-sm font-bold whitespace-nowrap text-accent"
          >
            <span
              aria-hidden="true"
              className="size-[7px] rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]"
            />
            {hero.eyebrow}
          </p>
          <h1
            id="hero-title"
            className="font-display text-[clamp(36px,5vw,64px)] leading-[1.35] font-extrabold text-balance text-ink"
          >
            <span className="sr-only">{hero.title}</span>
            <span aria-hidden="true">
              {hero.titleLead}
              <br />
              <TextLoop words={hero.loopWords} className="text-copper-gradient pb-[0.08em]" />
            </span>
          </h1>
          <p
            data-reveal=""
            data-delay="120"
            className="mt-6 max-w-[600px] text-[clamp(16px,1.6vw,19px)] leading-[2.05] text-pretty text-ink-5"
          >
            {hero.lead}
          </p>
          <div data-reveal="" data-delay="200" className="mt-[34px] flex flex-wrap gap-3">
            <Link href={hero.primaryCta.href} className={buttonClasses('cta', 'lg')}>
              <Shine />
              <span className="relative">{hero.primaryCta.label}</span>
              <span aria-hidden="true" className="relative">
                ‹
              </span>
            </Link>
            <Link
              href={hero.secondaryCta.href}
              className="flex h-[54px] shrink-0 items-center rounded-control border border-line-strong bg-white/2 px-6 text-base font-semibold whitespace-nowrap text-ink no-underline backdrop-blur-[6px] transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary hover:text-ink"
            >
              {hero.secondaryCta.label}
            </Link>
          </div>
          <Stats />
        </div>
        <SpiralFigure />
        <SpiralList />
      </div>
    </section>
  );
}
