'use client';

import { Button, ChipGroup, cn, EmptyState, ErrorMessage, formatDateTimeFa } from '@roshd/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  announceNotificationsChanged,
  type NotificationItem,
} from '@/components/dashboard/notifications';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 20;

/** Only dashboard paths produced by the API are followed. */
const safeLink = (link: string | null) => (link?.startsWith('/dashboard/') ? link : null);

export default function NotificationsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (filter === 'unread') query.set('unread', 'true');
  const { state, reload } = useApi<NotificationItem[]>(`/notifications/mine?${query.toString()}`);

  const open = async (item: NotificationItem) => {
    if (!item.readAt) {
      const result = await apiFetch(`/notifications/${item.id}/read`, { method: 'POST', body: {} });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      announceNotificationsChanged();
    }
    const link = safeLink(item.link);
    if (link) router.push(link);
    else reload({ silent: true });
  };

  const readAll = async () => {
    setError(null);
    const result = await apiFetch('/notifications/read-all', { method: 'POST', body: {} });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    announceNotificationsChanged();
    reload({ silent: true });
  };

  return (
    <>
      <PageTitle
        title="اعلان‌ها"
        action={
          <Button variant="ghost" size="sm" onClick={() => void readAll()}>
            علامت‌گذاری همه به‌عنوان خوانده‌شده
          </Button>
        }
      />
      <div className="mb-5">
        <ChipGroup
          label="نمایش"
          size="sm"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'همه' },
            { value: 'unread', label: 'خوانده‌نشده' },
          ]}
        />
      </div>
      {error ? <ErrorMessage className="mb-4">{error}</ErrorMessage> : null}
      <AsyncBoundary state={state} reload={reload}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState
              title={filter === 'unread' ? 'اعلان خوانده‌نشده‌ای ندارید' : 'هنوز اعلانی ندارید'}
              description="تغییر وضعیت درخواست‌ها، پاسخ تیکت‌ها و سفارش‌ها اینجا نمایش داده می‌شود."
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2" aria-label="فهرست اعلان‌ها">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void open(item)}
                      className={cn(
                        'flex w-full cursor-pointer flex-col gap-1 rounded-card border p-4 text-start',
                        item.readAt ? 'border-line bg-white' : 'border-primary/40 bg-primary-soft',
                      )}
                    >
                      <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
                        {!item.readAt ? (
                          <span className="size-2 shrink-0 rounded-full bg-primary">
                            <span className="sr-only">خوانده‌نشده</span>
                          </span>
                        ) : null}
                        {item.title}
                      </span>
                      {item.body ? <span className="text-sm text-ink-3">{item.body}</span> : null}
                      <time dateTime={item.createdAt} className="text-xs text-ink-5">
                        {formatDateTimeFa(item.createdAt)}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
              {state.status === 'success' ? (
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={state.meta?.total ?? items.length}
                  onChange={setPage}
                />
              ) : null}
            </>
          )
        }
      </AsyncBoundary>
    </>
  );
}
