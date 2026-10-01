import { cn } from '@roshd/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

const TABS = [
  { key: 'login', label: 'ورود', href: '/login' },
  { key: 'register', label: 'ثبت‌نام', href: '/register' },
] as const;

/**
 * Centered auth card for /login, /register and the password pages, in the visual language of
 * the design's auth modal (dark card, segmented «ورود / ثبت‌نام» switch). Auth stays email +
 * password (ADR-0002); the design's phone/OTP flow waits on OQ-08/OQ-20.
 */
export function AuthCard({
  title,
  lead,
  tab,
  children,
}: {
  title: string;
  lead: string;
  /** Shows the login/register switch with this one selected. */
  tab?: 'login' | 'register';
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden bg-linear-180 from-brand-950 to-brand-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="dots absolute inset-0 [--dot-color:var(--color-line-strong)] [--dot-size:26px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,#000,transparent_75%)]" />
        <div
          data-anim="breathe"
          className="absolute -inset-x-[20%] bottom-[-50%] h-[70%] bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_srgb,var(--color-primary)_30%,transparent),transparent_70%)] blur-[24px]"
        />
      </div>
      <div className="relative mx-auto flex min-h-[70vh] max-w-[480px] flex-col justify-center px-4 py-16">
        <div
          data-reveal=""
          data-dur="300"
          className="rounded-panel border border-line bg-brand-700 p-7 shadow-overlay"
        >
          {tab ? (
            <nav
              aria-label="نوع ورود"
              className="mb-5 grid grid-cols-2 rounded-control bg-brand-800 p-1"
            >
              {TABS.map((t) => (
                <Link
                  key={t.key}
                  href={t.href}
                  aria-current={t.key === tab ? 'page' : undefined}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-chip text-sm font-semibold text-ink no-underline transition-colors hover:text-ink',
                    t.key === tab
                      ? 'bg-brand-700 shadow-[0_1px_0_rgb(255_255_255/0.04)]'
                      : 'hover:bg-brand-700/60',
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <h1 className="mb-2 font-display text-xl font-extrabold text-ink">{title}</h1>
          <p className="mb-6 text-sm leading-loose text-ink-3">{lead}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
