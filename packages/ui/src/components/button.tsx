import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

export type ButtonVariant = 'primary' | 'cta' | 'secondary' | 'outline' | 'inverse' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'xl' | 'lg';

const base =
  'relative inline-flex shrink-0 items-center justify-center gap-2.5 overflow-hidden whitespace-nowrap rounded-control font-bold no-underline transition-[background-color,border-color,color,transform,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-70';

/*
 * primary   copper, text always on-primary (#111418, never white), lift on hover
 * cta       primary with the large copper glow and a 2px lift (hero, final CTA)
 * secondary graphite surface with a strong line; copper border on hover
 * outline   copper line and copper text; fills copper on hover
 * inverse   raised card button used on copper/feature panels
 * ghost     transparent with a line (header, hero secondary CTA)
 */
const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary shadow-cta-sm hover:-translate-y-px hover:bg-primary-hover hover:text-on-primary',
  cta: 'bg-primary text-on-primary shadow-cta hover:-translate-y-0.5 hover:bg-primary-hover hover:text-on-primary',
  secondary:
    'border border-line-strong bg-brand-700 font-semibold text-ink hover:-translate-y-px hover:border-primary hover:text-accent',
  outline:
    'border border-primary bg-transparent text-accent hover:bg-primary hover:text-on-primary',
  inverse: 'bg-brand-700 text-ink hover:-translate-y-px hover:text-accent',
  ghost:
    'border border-line-strong bg-transparent font-medium text-ink hover:border-primary hover:text-ink',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-10 px-3.5 text-sm',
  md: 'h-11 px-[18px] text-sm',
  xl: 'h-12 px-6 text-[15px]',
  lg: 'h-[54px] px-7 text-base',
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cn(base, variants[variant], sizes[size], className);
}

/**
 * Periodic light sweep across a copper button (design "shine", 6s). Place it as the first
 * child of a `buttonClasses('primary')` element and wrap the label in <span className="relative">.
 */
export function Shine() {
  return (
    <span
      data-anim="shine"
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 w-[40%] bg-linear-100 from-transparent via-white/35 to-transparent"
    />
  );
}

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

/** Link styled as a button. Pass Next's <Link> via `as` when client-side navigation is needed. */
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a className={buttonClasses(variant, size, className)} {...props} />;
}
