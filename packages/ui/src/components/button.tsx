import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'inverse' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-bold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-70';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover hover:text-white',
  secondary:
    'border border-[#b9c6de] bg-white font-semibold text-brand-900 hover:border-primary hover:text-primary',
  outline: 'border border-primary bg-white text-primary hover:bg-primary hover:text-white',
  inverse: 'bg-white text-brand-900 hover:bg-surface-hover',
  ghost:
    'border border-line bg-white font-medium text-ink-2 hover:border-primary hover:text-primary',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-10 px-3.5 text-sm',
  md: 'h-11 px-[18px] text-sm',
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
