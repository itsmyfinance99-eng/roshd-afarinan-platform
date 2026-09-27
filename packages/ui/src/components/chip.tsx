'use client';

import { cn } from '../cn';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

/** Single-select filter chips (toggle buttons with aria-pressed). */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
}: {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn(
              'cursor-pointer rounded-chip border font-semibold transition-colors',
              size === 'sm' ? 'h-9 px-3 text-[13px]' : 'h-10 px-3.5 text-sm',
              on
                ? 'border-brand-900 bg-brand-900 text-white'
                : 'border-line-strong bg-white text-ink-2 hover:border-primary',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
