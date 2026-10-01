import { cn, ordinal } from '@roshd/ui';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Ticker } from '@/components/motion/ticker';
import { credentials, expertise, journeys, stats, trust } from '@/content/site';
import type { Journey } from '@/content/types';
import { WaveUnderline } from './wave-underline';

/* ───────────── Four journeys (design Home §4) ───────────── */

const tile =
  'relative flex flex-col overflow-hidden text-ink no-underline transition-[transform,border-color,box-shadow] duration-200 ease-enter hover:-translate-y-1 hover:text-ink focus-visible:outline-none';

function Spot({ size, strong }: { size: number; strong?: boolean }) {
  return (
    <span
      data-spot=""
      aria-hidden="true"
      className="spot"
      style={
        {
          '--spot-size': `${size}px`,
          '--spot-color': strong ? 'var(--color-accent)' : undefined,
          '--spot-alpha': strong ? '16%' : '9%',
        } as CSSProperties
      }
    />
  );
}

function TrainingArt() {
  return (
    <svg
      width="150"
      height="100"
      viewBox="0 0 150 100"
      fill="none"
      stroke="var(--color-graphite-500)"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
      className="absolute top-6 left-6"
    >
      <path
        d="M10 22h52a8 8 0 018 8v60a8 8 0 00-8-8H10z"
        pathLength={1}
        data-draw=""
        data-dur="1100"
      />
      <path
        d="M130 22H78a8 8 0 00-8 8v60a8 8 0 018-8h52z"
        pathLength={1}
        data-draw=""
        data-delay="150"
        data-dur="1100"
      />
      {[
        ['M20 38h36', '0s'],
        ['M20 50h36', '0.5s'],
        ['M20 62h26', '1s'],
        ['M84 38h36', '1.5s'],
        ['M84 50h36', '2s'],
        ['M84 62h26', '2.5s'],
      ].map(([d, delay]) => (
        <path
          key={d}
          d={d}
          pathLength={1}
          stroke="var(--color-steel)"
          data-anim="trace"
          style={{ animationDelay: delay }}
        />
      ))}
      <circle cx="130" cy="10" r="4" fill="var(--color-primary)" stroke="none" data-anim="float" />
      <circle cx="130" cy="10" r="4" fill="none" stroke="var(--color-primary)" data-anim="node" />
    </svg>
  );
}

function ResearchArt() {
  const bars: Array<[string, string]> = [
    ['M14 64V40', '0s'],
    ['M30 64V28', '0.35s'],
    ['M46 64V44', '0.7s'],
    ['M62 64V20', '1.05s'],
    ['M78 64V34', '1.4s'],
  ];
  return (
    <svg
      width="92"
      height="70"
      viewBox="0 0 92 70"
      fill="none"
      stroke="var(--color-graphite-500)"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="absolute top-[22px] left-[22px]"
    >
      <path d="M6 64h80" />
      {bars.map(([d, delay]) => (
        <path
          key={d}
          d={d}
          strokeWidth="4"
          stroke="var(--color-line-strong)"
          data-anim="bar"
          style={{ animationDelay: delay }}
        />
      ))}
      <path
        d="M10 30l18-12 16 10 18-18 20 8"
        stroke="var(--color-primary)"
        strokeWidth="1.8"
        pathLength={1}
        data-anim="trace"
      />
      <circle cx="62" cy="10" r="3" fill="var(--color-accent)" stroke="none" data-anim="float" />
    </svg>
  );
}

function SahamdarArt() {
  const edges = 'M20 16L46 34 72 14M46 34v26M20 16l-6 34M72 14l8 38M14 50l32 10 34-8';
  const outer: Array<[number, number, number, number]> = [
    [20, 16, 5, 300],
    [72, 14, 5, 450],
    [14, 50, 4, 600],
    [80, 52, 4, 750],
    [46, 60, 4, 900],
  ];
  return (
    <svg
      width="92"
      height="70"
      viewBox="0 0 92 70"
      fill="none"
      stroke="var(--color-graphite-500)"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
      className="absolute top-1 left-[22px]"
    >
      <path d={edges} pathLength={1} data-draw="" data-dur="1200" />
      <path
        d={edges}
        pathLength={1}
        stroke="var(--color-accent)"
        strokeWidth="1.8"
        data-anim="flow"
      />
      <circle cx="46" cy="34" r="7" fill="none" stroke="var(--color-primary)" data-anim="node" />
      {outer.map(([cx, cy, r, delay]) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={r}
          fill="var(--color-brand-700)"
          data-reveal="pop"
          data-delay={delay}
        />
      ))}
      <circle cx="46" cy="34" r="7" fill="var(--color-primary)" stroke="none" />
    </svg>
  );
}

function FeasibilityArt() {
  return (
    <>
      <div
        aria-hidden="true"
        className="grid-lines absolute -bottom-[60px] -left-[60px] size-[380px] [--grid-color:color-mix(in_srgb,var(--color-accent)_12%,transparent)] [--grid-size:32px] [mask-image:radial-gradient(closest-side,#000,transparent)]"
      />
      <div aria-hidden="true" className="absolute bottom-[70px] left-[70px] size-[120px]">
        <span className="absolute inset-0 rounded-full border border-accent/35" />
        <span className="absolute -inset-10 rounded-full border border-accent/22" />
        <span className="absolute -inset-20 rounded-full border border-accent/12" />
        <span
          data-anim="ping"
          className="absolute inset-0 rounded-full border-2 border-primary/70"
        />
        <span className="absolute top-1/2 left-1/2 -mt-1.5 -ml-1.5 size-3 rounded-full bg-primary shadow-[0_0_0_5px_color-mix(in_srgb,var(--color-primary)_25%,transparent),0_0_24px_var(--color-primary)]" />
      </div>
    </>
  );
}

const ART: Record<Journey['key'], () => ReactNode> = {
  training: TrainingArt,
  feasibility: FeasibilityArt,
  research: ResearchArt,
  sahamdar: SahamdarArt,
};

/** Grid placement per journey (1 col → 2 cols from 700px → 4 cols from 1024px). */
const PLACE: Record<Journey['key'], string> = {
  training: 'min-[700px]:col-span-2',
  feasibility:
    'min-h-[340px] min-[700px]:col-span-2 min-[700px]:min-h-[360px] lg:row-span-2 lg:min-h-[520px]',
  research: '',
  sahamdar: '',
};

export function JourneysBento() {
  return (
    <section
      aria-labelledby="journeys-title"
      className="mx-auto max-w-(--container-page) px-6 pt-24 pb-10"
    >
      <div data-reveal="" className="mb-9">
        <p className="mb-2.5 text-sm font-bold text-accent">مسیرها</p>
        <h2
          id="journeys-title"
          className="font-display text-[clamp(28px,3.4vw,42px)] leading-[1.4] font-extrabold text-ink"
        >
          چهار مسیر اصلی
        </h2>
      </div>
      <div
        data-stagger="80"
        className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2 lg:grid-cols-4"
      >
        {journeys.map((journey, i) => {
          const Art = ART[journey.key];
          const feature = journey.key === 'feasibility';
          return (
            <Link
              key={journey.key}
              href={journey.href}
              data-reveal=""
              data-spotlight=""
              className={cn(
                tile,
                PLACE[journey.key],
                feature
                  ? 'gap-3.5 rounded-feature border border-primary-line bg-linear-155 from-primary-soft via-copper-shade-1 via-60% to-copper-shade-2 p-8 hover:shadow-[0_30px_60px_-28px_rgb(0_0_0/0.8)] focus-visible:shadow-[0_0_0_3px_var(--color-primary),0_0_40px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]'
                  : 'min-h-[250px] gap-3 rounded-tile border border-line bg-brand-700 p-7 hover:border-primary hover:shadow-tile focus-visible:border-primary focus-visible:shadow-glow',
              )}
            >
              <Spot
                size={feature ? 480 : journey.key === 'training' ? 420 : 360}
                strong={feature}
              />
              <Art />
              <span className="relative text-[15px] font-bold text-accent">{ordinal(i)}</span>
              <h3
                className={cn(
                  'relative font-display font-extrabold text-ink',
                  feature
                    ? 'text-[clamp(34px,3.6vw,46px)]'
                    : journey.key === 'training'
                      ? 'text-[30px]'
                      : 'text-[26px]',
                )}
              >
                {journey.title}
              </h3>
              <p
                className={cn(
                  'relative leading-loose text-pretty text-ink-3',
                  feature
                    ? 'max-w-[380px] text-[17px]'
                    : journey.key === 'training'
                      ? 'max-w-[420px] text-base'
                      : 'text-[15px]',
                )}
              >
                {journey.description}
              </p>
              {feature ? (
                <span className="relative mt-auto inline-flex h-11 items-center self-start rounded-control bg-primary px-[18px] text-[15px] font-extrabold text-on-primary">
                  ورود به مسیر ‹
                </span>
              ) : (
                <span className="relative mt-auto text-[15px] font-bold text-accent">
                  ورود به مسیر ‹
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ───────────── Trust bento (design Home §5) ───────────── */

function ShieldCheck() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-primary)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-[5px] shrink-0"
    >
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function TrustBento() {
  const [experts, areas, founded] = stats;
  const small = 'rounded-tile border border-line p-7';
  return (
    <section
      aria-labelledby="trust-title"
      className="mx-auto max-w-(--container-page) px-6 pt-[72px] pb-24"
    >
      <div data-reveal="" className="mb-9">
        <p className="mb-2.5 text-sm font-bold text-accent">{trust.eyebrow}</p>
        <h2
          id="trust-title"
          className="font-display text-[clamp(20px,2.4vw,30px)] leading-normal font-extrabold text-ink sm:whitespace-nowrap"
        >
          {trust.title}
        </h2>
      </div>
      <div
        data-stagger="80"
        className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2 lg:grid-cols-3"
      >
        <div
          data-reveal=""
          className="relative flex min-h-[260px] flex-col justify-between gap-6 overflow-hidden rounded-feature bg-linear-160 from-primary-soft to-copper-shade-0 p-8 text-ink min-[700px]:col-span-2 lg:col-span-1 lg:col-start-1 lg:row-span-2 lg:row-start-1"
        >
          <div
            aria-hidden="true"
            className="dots absolute inset-0 [--dot-color:color-mix(in_srgb,var(--color-accent)_20%,transparent)] [--dot-size:20px] [mask-image:radial-gradient(ellipse_at_20%_100%,#000,transparent_70%)]"
          />
          <span className="relative text-sm font-bold text-accent">{trust.expertsKicker}</span>
          <div className="relative">
            <Ticker
              to={50}
              prefix="+"
              className="block text-[clamp(72px,9vw,120px)] leading-none font-black text-ink"
            />
            <span className="mt-3 block text-[22px] font-extrabold">{experts?.label}</span>
            <span className="mt-2 block text-sm leading-[1.9] text-ink-3">{experts?.detail}</span>
          </div>
        </div>

        <div
          data-reveal=""
          className={cn(small, 'flex flex-col gap-1.5 bg-brand-800 lg:col-start-2')}
        >
          <Ticker to={3} className="text-[56px] leading-[1.1] font-black text-accent" />
          <span className="text-lg font-extrabold text-ink">{areas?.label}</span>
          <span className="text-sm text-ink-3">{areas?.detail}</span>
        </div>

        <div
          data-reveal=""
          className={cn(
            small,
            'flex flex-col gap-4 bg-brand-700 min-[700px]:col-span-2 lg:col-span-1 lg:col-start-3 lg:row-span-3 lg:row-start-1',
          )}
        >
          <h3 className="font-display text-lg font-extrabold text-ink">{trust.credentialsTitle}</h3>
          <ul className="flex flex-col">
            {credentials.map((item) => (
              <li
                key={item}
                className="flex gap-3 border-b border-graphite-600 py-3 text-[14.5px] leading-[1.9] text-ink"
              >
                <ShieldCheck />
                <span className="min-w-0 flex-1">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-auto text-[13px] leading-[1.9] text-ink-3">{trust.credentialsNote}</p>
        </div>

        <div
          data-reveal=""
          className={cn(small, 'flex flex-col gap-1.5 bg-brand-800 lg:col-start-2')}
        >
          <span className="relative inline-block self-start text-[56px] leading-[1.1] font-black text-ink">
            {founded?.value}
            <WaveUnderline delay={300} className="-bottom-0.5 h-3.5" strokeWidth={4} />
          </span>
          <span className="mt-2 text-lg font-extrabold text-ink">{founded?.label}</span>
          <span className="text-sm text-ink-3">{founded?.detail}</span>
        </div>

        <div
          data-reveal=""
          className={cn(
            small,
            'flex flex-col gap-4 bg-brand-700 min-[700px]:col-span-2 lg:col-start-1 lg:col-end-3',
          )}
        >
          <h3 className="font-display text-lg font-extrabold text-ink">{trust.expertiseTitle}</h3>
          <ul className="flex flex-wrap gap-2">
            {expertise.map((item) => (
              <li
                key={item}
                className="flex h-[38px] items-center rounded-chip border border-line-strong bg-brand-700 px-3.5 text-[14.5px] font-semibold text-ink"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
