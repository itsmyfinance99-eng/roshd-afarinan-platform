'use client';

import type { Permission } from '@roshd/types';
import { Button, cn, ErrorMessage, Skeleton } from '@roshd/ui';
import { ROLE_LABELS_FA } from '@roshd/types';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { Logo } from '@/components/layout/logo';
import { apiFetch } from '@/lib/api-client';
import { notifySessionChange } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import { MeProvider } from './me-context';
import { NotificationBell } from './notifications';
import type { Me } from './types';

interface NavItem {
  href: string;
  label: string;
  permission?: Permission;
  /** Shown to holders of any of these permissions. */
  anyOf?: readonly Permission[];
}

/** One shell for every role; items appear according to permissions (roadmap §28). */
const NAV: NavItem[] = [
  { href: '/dashboard', label: 'پیشخوان' },
  { href: '/dashboard/requests', label: 'درخواست‌های من' },
  { href: '/dashboard/feasibility', label: 'پروژه‌های امکان‌سنجی' },
  { href: '/dashboard/tickets', label: 'پشتیبانی' },
  { href: '/dashboard/orders', label: 'سفارش‌های من' },
  { href: '/dashboard/notifications', label: 'اعلان‌ها' },
  { href: '/dashboard/files', label: 'فایل‌های من' },
  { href: '/dashboard/profile', label: 'پروفایل' },
  {
    // The financial analysis tool is for experts and staff until OQ-38 decides about members.
    href: '/dashboard/models',
    label: 'مدل‌های مالی',
    anyOf: ['financial-models:work', 'financial-models:manage'],
  },
  {
    href: '/dashboard/manage/requests',
    label: 'مدیریت درخواست‌ها',
    permission: 'requests:read-all',
  },
  {
    href: '/dashboard/manage/feasibility',
    label: 'مدیریت امکان‌سنجی',
    anyOf: ['feasibility:manage', 'feasibility:work'],
  },
  {
    href: '/dashboard/manage/questionnaires',
    label: 'قالب‌های پرسشنامه',
    permission: 'feasibility:manage',
  },
  { href: '/dashboard/manage/tickets', label: 'مدیریت تیکت‌ها', permission: 'tickets:read-all' },
  { href: '/dashboard/content', label: 'مدیریت محتوا', permission: 'cms:write' },
  { href: '/dashboard/pages', label: 'صفحات سازمانی', permission: 'cms:write' },
  { href: '/dashboard/catalog', label: 'مدیریت کاتالوگ', permission: 'catalog:manage' },
  {
    href: '/dashboard/manage/orders',
    label: 'سفارش‌ها و پرداخت‌ها',
    permission: 'orders:read-all',
  },
  { href: '/dashboard/manage/files', label: 'فایل‌های کاربران', permission: 'files:read-all' },
  { href: '/dashboard/manage/users', label: 'مدیریت کاربران', permission: 'users:read' },
  { href: '/dashboard/manage/audit', label: 'گزارش رویدادها', permission: 'audit:read' },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, reload } = useApi<Me>('/auth/me');

  const unauthenticated = state.status === 'error' && state.httpStatus === 401;
  useEffect(() => {
    if (unauthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthenticated, pathname, router]);

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST', body: {}, retryAuth: false });
    notifySessionChange();
    router.replace('/');
    router.refresh();
  };

  if (state.status !== 'success') {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16">
        {state.status === 'error' && !unauthenticated ? (
          <div className="flex flex-col items-start gap-3">
            <ErrorMessage>{state.message}</ErrorMessage>
            <Button variant="outline" onClick={() => reload()}>
              تلاش دوباره
            </Button>
          </div>
        ) : (
          <div aria-busy="true" aria-label="در حال بارگذاری" className="flex flex-col gap-4">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-40" />
          </div>
        )}
      </div>
    );
  }

  const me = state.data;
  const items = NAV.filter(
    (item) =>
      (!item.permission || me.permissions.includes(item.permission)) &&
      (!item.anyOf || item.anyOf.some((permission) => me.permissions.includes(permission))),
  );
  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <MeProvider value={me}>
      <div className="min-h-screen bg-brand-900">
        <header className="border-b border-line bg-brand-950">
          <div className="mx-auto flex h-[72px] max-w-(--container-page) items-center gap-4 px-6">
            <Logo />
            <div className="ms-auto flex items-center gap-3">
              <span className="hidden text-sm text-ink-3 sm:inline">
                {me.fullName}
                <span className="ms-2 text-xs text-ink-5">
                  (
                  {me.roles
                    .filter((r) => r !== 'user')
                    .map((r) => ROLE_LABELS_FA[r])
                    .join('، ') || ROLE_LABELS_FA.user}
                  )
                </span>
              </span>
              <NotificationBell />
              <Link href="/" className="text-sm text-accent no-underline hover:text-ink">
                سایت
              </Link>
              <Button variant="ghost" size="sm" onClick={() => void logout()}>
                خروج
              </Button>
            </div>
          </div>
        </header>
        {/* Dashboard content reads on paper (design/INTEGRATION.md D14). */}
        <div data-surface="paper" className="min-h-[calc(100vh-73px)]">
          <div className="mx-auto grid max-w-(--container-page) gap-6 px-6 py-8 md:grid-cols-[220px_1fr]">
            <nav aria-label="منوی داشبورد" className="min-w-0 md:self-start">
              <ul className="flex gap-2 overflow-x-auto md:flex-col">
                {items.map((item) => (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      className={cn(
                        'block rounded-control px-4 py-2.5 text-sm no-underline transition-colors',
                        isActive(item.href)
                          ? 'bg-primary font-bold text-on-primary hover:text-on-primary'
                          : 'bg-paper text-ink hover:text-accent',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <main
              id="main"
              tabIndex={-1}
              className="min-w-0 rounded-panel border border-paper-line bg-paper p-6 outline-none"
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </MeProvider>
  );
}
