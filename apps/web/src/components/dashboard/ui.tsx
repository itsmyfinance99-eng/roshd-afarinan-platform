'use client';

import {
  Button,
  cn,
  EmptyState,
  ErrorMessage,
  formatDateFa,
  Skeleton,
  toPersianDigits,
} from '@roshd/ui';
import {
  SERVICE_REQUEST_DETAIL_LABELS_FA,
  SERVICE_REQUEST_STATUS_LABELS_FA,
  SERVICE_REQUEST_TYPE_LABELS_FA,
  type ServiceRequestStatus,
} from '@roshd/validation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ApiState } from '@/lib/use-api';
import type { ServiceRequestItem } from './types';

const STATUS_TONE: Record<ServiceRequestStatus, string> = {
  NEW: 'bg-paper-3 text-copper-deep',
  IN_REVIEW: 'bg-notice-bg text-notice-fg',
  RESPONDED: 'bg-success-bg text-success-fg',
  CLOSED: 'bg-surface-2 text-ink-4',
};

export function StatusBadge({ status }: { status: ServiceRequestStatus }) {
  return (
    <span
      className={cn(
        'inline-block rounded-chip px-2 py-[3px] text-xs font-bold',
        STATUS_TONE[status],
      )}
    >
      {SERVICE_REQUEST_STATUS_LABELS_FA[status]}
    </span>
  );
}

export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-extrabold text-brand-900">{title}</h1>
      {action}
    </div>
  );
}

/** Renders loading / error (with retry) / success for a useApi() state. */
export function AsyncBoundary<T>({
  state,
  reload,
  children,
}: {
  state: ApiState<T>;
  reload: (options?: { silent?: boolean }) => void;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') {
    return (
      <div aria-busy="true" aria-label="در حال بارگذاری" className="flex flex-col gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorMessage>
          {state.httpStatus === 404 ? 'موردی با این مشخصات یافت نشد.' : state.message}
        </ErrorMessage>
        <Button variant="outline" onClick={() => reload()}>
          تلاش دوباره
        </Button>
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

export function RequestList({
  items,
  hrefBase,
  showRequester = false,
  emptyAction,
}: {
  items: ServiceRequestItem[];
  hrefBase: string;
  showRequester?: boolean;
  emptyAction?: ReactNode;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="هنوز درخواستی ثبت نشده است"
        description="درخواست‌های امکان‌سنجی، پژوهش، مشاوره و تماس شما اینجا نمایش داده می‌شوند."
        action={emptyAction}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`${hrefBase}/${item.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4 text-ink no-underline hover:border-line-hover hover:text-ink"
          >
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-bold">
                {SERVICE_REQUEST_TYPE_LABELS_FA[item.type]}
                {item.subject ? ` — ${item.subject}` : ''}
              </span>
              <span className="text-[13px] text-ink-5">
                <span dir="ltr">{toPersianDigits(item.trackingCode)}</span> ·{' '}
                {formatDateFa(item.createdAt)}
                {showRequester ? ` · ${item.fullName}` : ''}
                {item.assignee !== undefined
                  ? ` · کارشناس: ${item.assignee?.fullName ?? 'ارجاع‌نشده'}`
                  : ''}
              </span>
            </span>
            <StatusBadge status={item.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="صفحه‌بندی" className="mt-6 flex items-center justify-center gap-3 text-sm">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        قبلی
      </Button>
      <span>
        صفحه {toPersianDigits(page)} از {toPersianDigits(pages)}
      </span>
      <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        بعدی
      </Button>
    </nav>
  );
}

export function RequestDetails({ item }: { item: ServiceRequestItem }) {
  const extra = Object.entries(item.details ?? {}).filter(([key]) => key !== 'topic');
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 rounded-card bg-surface p-5 text-[15px]">
      <dt className="text-ink-5">نوع</dt>
      <dd>{SERVICE_REQUEST_TYPE_LABELS_FA[item.type]}</dd>
      <dt className="text-ink-5">کد پیگیری</dt>
      <dd dir="ltr" className="text-right font-mono">
        {item.trackingCode}
      </dd>
      <dt className="text-ink-5">وضعیت</dt>
      <dd>
        <StatusBadge status={item.status} />
      </dd>
      <dt className="text-ink-5">تاریخ ثبت</dt>
      <dd>{formatDateFa(item.createdAt)}</dd>
      {item.subject ? (
        <>
          <dt className="text-ink-5">موضوع</dt>
          <dd>{item.subject}</dd>
        </>
      ) : null}
      {extra.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-ink-5">{SERVICE_REQUEST_DETAIL_LABELS_FA[key] ?? key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      <dt className="text-ink-5">متن</dt>
      <dd className="leading-loose whitespace-pre-line">{item.message}</dd>
    </dl>
  );
}

export function StatusTimeline({
  events,
}: {
  events: { toStatus: ServiceRequestStatus; note: string | null; createdAt: string }[];
}) {
  return (
    <ol className="flex flex-col gap-3 border-s-2 border-line ps-5">
      {events.map((event, i) => (
        <li key={`${event.createdAt}-${i}`} className="relative">
          <span
            aria-hidden="true"
            className="absolute top-1.5 -start-[27px] size-3 rounded-full border-2 border-white bg-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={event.toStatus} />
            <time dateTime={event.createdAt} className="text-[13px] text-ink-5">
              {formatDateFa(event.createdAt)}
            </time>
          </div>
          {event.note ? <p className="mt-1.5 text-sm text-ink-3">{event.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
