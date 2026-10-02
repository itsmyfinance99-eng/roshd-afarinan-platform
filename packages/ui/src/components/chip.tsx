'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '../cn';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export type ChipVariant = 'bordered' | 'plain';

/**
 * Chip look shared by button chips and link chips. The active chip paints its own copper
 * background until the sliding indicator is measured (`group-data-ready/chips`), so the
 * selection is visible without JavaScript too.
 */
export function chipClasses(
  on: boolean,
  variant: ChipVariant = 'bordered',
  size: 'sm' | 'md' = 'md',
) {
  return cn(
    'relative inline-flex cursor-pointer items-center whitespace-nowrap rounded-control font-semibold no-underline transition-[color,border-color,background-color] duration-[250ms]',
    size === 'md' ? 'h-10 text-sm' : 'h-9 text-[13px]',
    variant === 'bordered' ? (size === 'md' ? 'border px-3.5' : 'border px-3') : 'px-4',
    on
      ? 'border-transparent bg-primary text-on-primary hover:text-on-primary group-data-ready/chips:bg-transparent'
      : cn(
          'bg-transparent text-ink-3 hover:text-primary',
          variant === 'bordered' && 'border-line-strong hover:border-primary',
        ),
  );
}

const ACTIVE = '[aria-pressed="true"], [aria-current="page"], [aria-current="true"]';

/**
 * One copper pill that slides (transform + width, 300ms state easing) to the active chip.
 * Anchored at the right edge (RTL), so the offset is measured from the right. Works around
 * any chip markup: buttons with aria-pressed or links with aria-current.
 */
export function SlidingChips({
  label,
  as: Tag = 'div',
  className,
  children,
}: {
  label: string;
  as?: 'div' | 'nav';
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    const active = el?.querySelector<HTMLElement>(ACTIVE);
    if (!el || !active) {
      setBox(null);
      return;
    }
    const next = {
      x: -(el.offsetWidth - (active.offsetLeft + active.offsetWidth)),
      y: active.offsetTop,
      w: active.offsetWidth,
      h: active.offsetHeight,
    };
    setBox((prev) =>
      prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h
        ? prev
        : next,
    );
  }, []);

  useLayoutEffect(() => {
    measure();
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    ro?.observe(el);
    const mo = new MutationObserver(() => measure());
    mo.observe(el, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-pressed', 'aria-current'],
    });
    return () => {
      ro?.disconnect();
      mo.disconnect();
    };
  }, [measure]);

  const style: CSSProperties | undefined = box
    ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h }
    : undefined;

  return (
    <Tag
      ref={ref as never}
      role={Tag === 'div' ? 'group' : undefined}
      aria-label={label}
      data-ready={box ? '' : undefined}
      className={cn('group/chips relative flex flex-wrap gap-2', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-0 right-0 rounded-control bg-primary shadow-[0_6px_16px_-8px_rgb(0_0_0/0.6)] transition-[transform,width] duration-300 ease-state',
          box ? 'opacity-100' : 'opacity-0',
        )}
        style={style}
      />
      {children}
    </Tag>
  );
}

/** Single-select filter chips (toggle buttons with aria-pressed) with the sliding indicator. */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = 'bordered',
  size = 'md',
  className,
}: {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: ChipVariant;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <SlidingChips label={label} className={className}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={chipClasses(on, variant, size)}
          >
            {option.label}
          </button>
        );
      })}
    </SlidingChips>
  );
}

/** Copper on/off switch (40×24, 18px knob). Label it with the surrounding <label>. */
export function Switch({
  checked,
  onChange,
  className,
  ...props
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  id?: string;
  'aria-describedby'?: string;
}) {
  return (
    <span
      className={cn(
        'relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors duration-[250ms] ease-state',
        checked ? 'bg-primary' : 'bg-line-strong',
        className,
      )}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="absolute inset-0 m-0 cursor-pointer opacity-0"
        {...props}
      />
      <SwitchKnob on={checked} />
    </span>
  );
}

/** The knob alone, for link-based switches that navigate instead of toggling state. */
export function SwitchKnob({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute top-[3px] right-[3px] size-[18px] rounded-full bg-brand-700 shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-[250ms] ease-state',
        on && '-translate-x-4',
      )}
    />
  );
}
