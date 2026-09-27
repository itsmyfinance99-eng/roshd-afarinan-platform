import type { ReactNode } from 'react';
import { cn } from '../cn';

/** Marks sample content. Required on every demo record (CLAUDE.md: "نمونه نمایشی"). */
export function DemoBadge({
  children = 'نمونه نمایشی',
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block rounded-chip border border-dashed border-demo-border bg-demo-bg px-2 py-[3px] text-xs font-bold text-demo-fg',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Neutral tag, e.g. "به‌زودی" / "هنوز در دسترس نیست". */
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
        'rounded-control border border-danger/30 bg-danger/5 p-4 text-[15px] text-danger',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-card border border-dashed border-line-strong px-6 py-14 text-center',
        className,
      )}
    >
      <p className="mb-2 text-lg font-bold text-ink">{title}</p>
      {description ? <p className="mb-4 text-sm text-ink-4">{description}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-card border border-line bg-surface-2', className)}
    />
  );
}

/** Striped placeholder for images that are not supplied yet (OQ-17). */
export function ImagePlaceholder({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`جای ${label}`}
      className={cn(
        'flex items-center justify-center bg-[repeating-linear-gradient(135deg,#eef2f8_0_10px,#e6ecf5_10px_20px)] font-mono text-xs text-ink-5',
        className,
      )}
    >
      {label}
    </div>
  );
}
