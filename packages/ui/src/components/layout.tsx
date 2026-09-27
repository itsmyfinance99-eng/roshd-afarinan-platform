import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

/** Page-width container (max 1280px, 24px gutter) used by every section. */
export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mx-auto w-full max-w-(--container-page) px-6', className)} {...props} />
  );
}

type Tone = 'default' | 'muted' | 'dark';

const tones: Record<Tone, string> = {
  default: 'bg-white',
  muted: 'border-y border-line bg-surface',
  dark: 'bg-brand-900 text-white',
};

export function Section({
  tone = 'default',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { tone?: Tone }) {
  return (
    <section className={cn(tones[tone], className)} {...props}>
      {children}
    </section>
  );
}

/** Eyebrow + title (+ optional action link) block used at the top of sections. */
export function SectionHeader({
  id,
  eyebrow,
  title,
  action,
  tone = 'default',
  className,
}: {
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'dark';
  className?: string;
}) {
  return (
    <div className={cn('mb-7 flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        {eyebrow ? (
          <p
            className={cn(
              'mb-2.5 text-sm font-bold',
              tone === 'dark' ? 'text-accent-soft' : 'text-primary',
            )}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2
          id={id}
          className={cn(
            'text-[clamp(26px,3vw,36px)] leading-normal font-extrabold',
            tone === 'dark' ? 'text-white' : 'text-brand-900',
          )}
        >
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
