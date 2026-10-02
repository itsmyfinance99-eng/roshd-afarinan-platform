import type { ReactNode } from 'react';
import { cn } from '../cn';

/** Marks sample content. Required on every demo record (CLAUDE.md: "نمونه نمایشی"). */
export function DemoBadge({
  children = 'نمونه نمایشی',
  size = 'md',
  className,
}: {
  children?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block rounded-chip border border-dashed border-demo-border bg-demo-bg font-bold whitespace-nowrap text-demo-fg',
        size === 'sm' && 'px-[7px] py-0.5 text-[11.5px]',
        size === 'md' && 'px-2 py-[3px] text-xs',
        size === 'lg' && 'px-2.5 py-1.5 text-[13px]',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Neutral tag, e.g. "هنوز در دسترس نیست". */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded-chip border border-line-strong px-2 py-[3px] text-xs font-bold text-ink-3',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        'rounded-control border border-notice-border bg-notice-bg px-4 py-3.5 text-sm leading-[1.9] text-notice-fg',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SuccessMessage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn('rounded-control bg-success-bg p-4 text-[15px] text-success-fg', className)}
    >
      {children}
    </div>
  );
}

export function ErrorMessage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-control border border-danger/40 bg-danger/10 p-4 text-[15px] text-danger',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Line icon for empty states (design: magnifier with a dash). */
export function EmptyIcon() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className="mx-auto text-steel/60"
    >
      <circle cx="24" cy="24" r="14" />
      <path d="M34 34l10 10M18 24h12" />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = <EmptyIcon />,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-panel border border-dashed border-line-strong bg-surface px-6 py-14 text-center',
        className,
      )}
    >
      {icon}
      <p className="mt-3 mb-2 text-lg font-bold text-ink">{title}</p>
      {description ? <p className="mb-4 text-sm text-ink-3">{description}</p> : null}
      {action}
    </div>
  );
}

/** Card-shaped loading placeholder with a copper shimmer sweep. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-card border border-line bg-brand-700',
        className,
      )}
    >
      <span
        data-anim="shimmer"
        className="absolute inset-0 bg-linear-90 from-transparent via-primary/10 to-transparent"
      />
    </div>
  );
}

type PlaceholderPattern = 'grid' | 'dots' | 'stripes';

const patterns: Record<PlaceholderPattern, string> = {
  grid: 'grid-lines [--grid-color:var(--color-graphite-600)] [--grid-size:24px]',
  dots: 'dots [--dot-color:var(--color-line)] [--dot-size:18px]',
  stripes:
    'bg-[repeating-linear-gradient(135deg,var(--color-graphite-600)_0_10px,var(--color-brand-700)_10px_20px)]',
};

/** Patterned slot for images that are not supplied yet (OQ-17). */
export function ImagePlaceholder({
  label,
  pattern = 'stripes',
  icon,
  className,
}: {
  label: string;
  pattern?: PlaceholderPattern;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={`جای ${label}`}
      className={cn(
        'flex items-center justify-center bg-brand-800 text-xs text-ink-5',
        patterns[pattern],
        className,
      )}
    >
      {icon ?? <span className="font-mono">{label}</span>}
    </div>
  );
}

/** Success mark: circle then check, drawn with stroke-dashoffset (design forms). */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      aria-hidden="true"
      className={cn('text-success-line', className)}
    >
      <circle
        cx="36"
        cy="36"
        r="32"
        stroke="currentColor"
        strokeWidth="3"
        pathLength={1}
        data-draw=""
        data-dur="700"
      />
      <path
        d="M23 37l9 9 18-19"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        data-draw=""
        data-delay="550"
        data-dur="500"
      />
    </svg>
  );
}
