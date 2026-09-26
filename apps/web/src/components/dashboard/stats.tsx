'use client';

import { formatDateTimeFa, formatNumber } from '@roshd/ui';
import {
  SERVICE_REQUEST_STATUS_LABELS_FA,
  SERVICE_REQUEST_STATUSES,
  type ServiceRequestStatus,
  type TicketStatus,
} from '@roshd/validation';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { useCan } from './me-context';
import { AsyncBoundary } from './ui';

/** Mirrors GET /api/v1/dashboard/stats: sections appear only with their permission. */
interface DashboardStats {
  requests?: {
    byStatus: Record<ServiceRequestStatus, number>;
    total: number;
    open: number;
    lastSevenDays: number;
  };
  tickets?: { byStatus: Record<TicketStatus, number>; open: number };
  users?: { active: number; suspended: number };
  generatedAt: string;
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <span className="text-[13px] text-ink-4">{label}</span>
      <span className="text-[28px] leading-tight font-extrabold text-brand-900">
        {formatNumber(value)}
      </span>
    </>
  );
  const className =
    'flex flex-col gap-1 rounded-card border border-line bg-white p-4 text-ink no-underline';
  return href ? (
    <Link href={href} className={`${className} hover:border-line-hover hover:text-ink`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Live counts for staff (no sample or estimated numbers). Hidden for users without access. */
export function StaffStats() {
  const canRequests = useCan('requests:read-all');
  const canTickets = useCan('tickets:read-all');
  const canUsers = useCan('users:read');
  const visible = canRequests || canTickets || canUsers;
  const { state, reload } = useApi<DashboardStats>(visible ? '/dashboard/stats' : null);

  if (!visible) return null;

  return (
    <section aria-labelledby="stats-title" className="mb-10">
      <h2 id="stats-title" className="mb-4 text-lg font-extrabold text-brand-900">
        آمار سامانه
      </h2>
      <AsyncBoundary state={state} reload={reload}>
        {(stats) => (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,170px),1fr))] gap-3">
              {stats.requests ? (
                <>
                  <Stat
                    label="درخواست‌های باز"
                    value={stats.requests.open}
                    href="/dashboard/manage/requests"
                  />
                  <Stat label="درخواست‌های ۷ روز اخیر" value={stats.requests.lastSevenDays} />
                </>
              ) : null}
              {stats.tickets ? (
                <Stat
                  label="تیکت‌های باز"
                  value={stats.tickets.open}
                  href="/dashboard/manage/tickets"
                />
              ) : null}
              {stats.users ? (
                <Stat
                  label="کاربران فعال"
                  value={stats.users.active}
                  href="/dashboard/manage/users"
                />
              ) : null}
            </div>
            {stats.requests ? (
              <dl
                aria-label="درخواست‌ها بر اساس وضعیت"
                className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-4"
              >
                {SERVICE_REQUEST_STATUSES.map((s) => (
                  <div key={s} className="flex gap-1">
                    <dt>{SERVICE_REQUEST_STATUS_LABELS_FA[s]}:</dt>
                    <dd className="font-bold text-ink-2">
                      {formatNumber(stats.requests?.byStatus[s] ?? 0)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <p className="mt-2 text-xs text-ink-5">
              به‌روزرسانی: {formatDateTimeFa(stats.generatedAt)}
            </p>
          </>
        )}
      </AsyncBoundary>
    </section>
  );
}
