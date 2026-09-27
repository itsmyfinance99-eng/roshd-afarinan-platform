'use client';

import { cn, toPersianDigits } from '@roshd/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useApi } from '@/lib/use-api';

/** Mirrors the API notification view. */
export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Fired after notifications are marked read so the header badge refreshes at once. */
export const NOTIFICATIONS_CHANGED = 'roshd:notifications-changed';

export function announceNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

const POLL_MS = 60_000;

/** Header bell with the unread count; refreshes on navigation, every minute and on changes. */
export function NotificationBell() {
  const pathname = usePathname();
  const { state, reload } = useApi<{ unread: number }>('/notifications/unread-count');
  const mounted = useRef(false);

  useEffect(() => {
    // useApi already fetches on mount; refresh only when the route actually changes,
    // otherwise every dashboard load asks for the count twice (ST-26.09, finding P-07).
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    reload({ silent: true });
  }, [pathname, reload]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') reload({ silent: true });
    };
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
    };
  }, [reload]);

  const unread = state.status === 'success' ? state.data.unread : 0;
  const label = unread > 0 ? `اعلان‌ها (${toPersianDigits(unread)} خوانده‌نشده)` : 'اعلان‌ها';

  return (
    <Link
      href="/dashboard/notifications"
      aria-label={label}
      title={label}
      className="relative inline-flex size-10 items-center justify-center rounded-full text-ink-3 no-underline hover:bg-surface hover:text-ink"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute -top-0.5 -end-0.5 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] leading-5 font-bold text-white',
          )}
        >
          {unread > 99 ? '۹۹+' : toPersianDigits(unread)}
        </span>
      ) : null}
    </Link>
  );
}
