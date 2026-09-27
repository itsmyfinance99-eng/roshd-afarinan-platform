'use client';

import { buttonClasses } from '@roshd/ui';
import Link from 'next/link';
import { useMe } from '@/components/dashboard/me-context';
import { StaffStats } from '@/components/dashboard/stats';
import type { ServiceRequestItem } from '@/components/dashboard/types';
import { AsyncBoundary, PageTitle, RequestList } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

export default function DashboardHome() {
  const me = useMe();
  const { state, reload } = useApi<ServiceRequestItem[]>('/service-requests/mine?pageSize=5');

  return (
    <>
      <PageTitle title={`خوش آمدید، ${me.fullName}`} />
      <StaffStats />
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
        <Link href="/feasibility/request" className={buttonClasses('primary', 'md')}>
          درخواست امکان‌سنجی
        </Link>
        <Link href="/research/request" className={buttonClasses('secondary', 'md')}>
          سفارش پژوهش
        </Link>
        <Link href="/consulting/request" className={buttonClasses('secondary', 'md')}>
          درخواست مشاوره
        </Link>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-brand-900">آخرین درخواست‌ها</h2>
        <Link href="/dashboard/requests" className="text-sm font-bold no-underline">
          همه ‹
        </Link>
      </div>
      <AsyncBoundary state={state} reload={reload}>
        {(items) => <RequestList items={items} hrefBase="/dashboard/requests" />}
      </AsyncBoundary>
    </>
  );
}
