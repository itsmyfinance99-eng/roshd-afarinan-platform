import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../cn';

/* 48px controls; copper focus ring on dark, copper-deep on paper (--color-focus). */
const control =
  'w-full rounded-control border bg-brand-700 px-3.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-200 ease-state placeholder:text-ink-5 focus:border-focus focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_15%,transparent)] focus-visible:outline-none';

function borderFor(error?: string) {
  return error ? 'border-danger' : 'border-line-strong';
}

function ErrorIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.5" />
    </svg>
  );
}

interface FieldShellProps {
  id: string;
  label: ReactNode;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint + error, wired with aria-describedby / aria-invalid by the callers. */
export function FieldShell({
  id,
  label,
  required,
  error,
  hint,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required ? (
          <span className="ms-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <span id={`${id}-hint`} className="text-[12.5px] text-ink-3">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          id={`${id}-error`}
          role="alert"
          className="flex items-center gap-1.5 text-[13px] text-danger"
        >
          <ErrorIcon />
          {error}
        </span>
      ) : null}
    </div>
  );
}

type ControlProps = { id: string; error?: string; hasHint?: boolean };

function describedBy({ id, error, hasHint }: ControlProps) {
  return error ? `${id}-error` : hasHint ? `${id}-hint` : undefined;
}

export const TextInput = forwardRef<
  HTMLInputElement,
  ControlProps & InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ id, error, hasHint, className, ...props }, ref) {
  return (
    <input
      ref={ref}
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy({ id, error, hasHint })}
      className={cn(control, 'h-12', borderFor(error), className)}
      {...props}
    />
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  ControlProps & TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ id, error, hasHint, className, rows = 5, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      id={id}
      rows={rows}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy({ id, error, hasHint })}
      className={cn(control, 'resize-y py-3 leading-[1.9]', borderFor(error), className)}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  ControlProps & SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ id, error, hasHint, className, ...props }, ref) {
  return (
    <select
      ref={ref}
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy({ id, error, hasHint })}
      className={cn(control, 'h-12 px-3', borderFor(error), className)}
      {...props}
    />
  );
});
