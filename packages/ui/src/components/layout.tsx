import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

/** Page-width container (max 1280px, 24px gutter) used by every section. */
export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mx-auto w-full max-w-(--container-page) px-6', className)} {...props} />
  );
}

/*
 * default  page graphite (#111418)
 * raised   one step lighter band (#15191F) with lines — e.g. research + knowledge
 * deep     darkest band (#0B0E12) — process, footer-like panels
 * paper    light reading/form region (data-surface="paper")
 * `muted` and `dark` are kept as aliases of raised/deep.
 */
type Tone = 'default' | 'raised' | 'deep' | 'paper' | 'muted' | 'dark';

const tones: Record<Tone, string> = {
  default: '',
  raised: 'border-y border-line bg-brand-800',
  muted: 'border-y border-line bg-brand-800',
  deep: 'bg-brand-950',
  dark: 'bg-brand-950',
  paper: 'border-y border-paper-line',
};

export function Section({
  tone = 'default',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { tone?: Tone }) {
  return (
    <section
      data-surface={tone === 'paper' ? 'paper' : undefined}
      className={cn('relative', tones[tone], className)}
      {...props}
    >
      {children}
    </section>
  );
}

/** Eyebrow + display title (+ optional action link) used at the top of sections. */
export function SectionHeader({
  id,
  eyebrow,
  title,
  action,
  size = 'lg',
  className,
}: {
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  /** lg: clamp(28px,3.4vw,42px) section titles; md: clamp(26px,3vw,36px) catalog titles. */
  size?: 'lg' | 'md';
  /** @deprecated v1 prop, ignored: colours follow the surface. */
  tone?: 'default' | 'dark';
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
            'font-display leading-[1.4] font-extrabold text-balance text-ink',
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

/** "همه ‹" style link used beside section titles. */
export function sectionLinkClasses(className?: string) {
  return cn('text-[15px] font-bold text-accent no-underline hover:text-ink', className);
}
