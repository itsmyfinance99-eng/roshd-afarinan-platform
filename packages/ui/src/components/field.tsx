import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../cn';

const control =
  'w-full rounded-control border bg-white px-3 text-[15px] text-ink outline-none transition-colors focus-visible:border-primary';

function borderFor(error?: string) {
  return error ? 'border-danger' : 'border-line-strong';
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
      <label htmlFor={id} className="text-sm font-semibold text-ink-2">
        {label}
        {required ? (
          <span className="ms-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <span id={`${id}-hint`} className="text-xs text-ink-5">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} role="alert" className="text-[13px] text-danger">
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
      className={cn(control, 'h-[46px]', borderFor(error), className)}
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
      className={cn(control, 'resize-y py-2.5', borderFor(error), className)}
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
      className={cn(control, 'h-[46px] px-2.5', borderFor(error), className)}
      {...props}
    />
  );
});
