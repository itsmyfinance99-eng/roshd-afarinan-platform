import type { Permission } from '@roshd/types';

export interface NavItem {
  href: string;
  label: string;
  permission?: Permission;
  /** Shown to holders of any of these permissions. */
  anyOf?: readonly Permission[];
}

/** One shell for every role; items appear according to permissions (roadmap §28). */
export const DASHBOARD_NAV: NavItem[] = [
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
  {
    href: '/dashboard/manage/report-templates',
    label: 'قالب‌های گزارش',
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
  { href: '/dashboard/help', label: 'راهنما' },
];

/** The items of the menu a holder of `permissions` sees, in the order of the menu. */
export function visibleNav(permissions: readonly Permission[]): NavItem[] {
  return DASHBOARD_NAV.filter(
    (item) =>
      (!item.permission || permissions.includes(item.permission)) &&
      (!item.anyOf || item.anyOf.some((permission) => permissions.includes(permission))),
  );
}
