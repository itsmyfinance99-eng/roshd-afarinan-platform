'use client';

import { Button, ChipGroup, ErrorMessage, FieldShell, TextInput } from '@roshd/ui';
import { ORDER_STATUS_LABELS_FA, ORDER_STATUSES } from '@roshd/validation';
import { useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import { StaffOrderList, type StaffOrderView } from '@/components/dashboard/orders';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 20;
const ALL = 'ALL';

/** Finance view of every order (ST-27.01): the `orders:read-all` permission had no UI before. */
export default function ManageOrdersPage() {
  const allowed = useCan('orders:read-all');
  const [status, setStatus] = useState<string>(ALL);
  const [code, setCode] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = new URLSearchParams();
  if (status !== ALL) query.set('status', status);
  if (search) query.set('q', search);
  query.set('page', String(page));
  query.set('pageSize', String(PAGE_SIZE));
  const { state, reload } = useApi<StaffOrderView[]>(
    allowed ? `/orders?${query.toString()}` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle title="سفارش‌ها و پرداخت‌ها" />
      <div className="mb-6 flex flex-col gap-3">
        <ChipGroup
          label="وضعیت"
          size="sm"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: ALL, label: 'همه وضعیت‌ها' },
            ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS_FA[s] })),
          ]}
        />
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(code.trim());
            setPage(1);
          }}
        >
          <FieldShell id="order-code" label="کد سفارش" hint="بخشی از کد هم کافی است، مثل 7K3M">
            <TextInput
              id="order-code"
              value={code}
              dir="ltr"
              onChange={(e) => setCode(e.target.value)}
            />
          </FieldShell>
          <Button type="submit" size="sm">
            جست‌وجو
          </Button>
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCode('');
                setSearch('');
                setPage(1);
              }}
            >
              حذف جست‌وجو
            </Button>
          ) : null}
        </form>
      </div>
      <AsyncBoundary state={state} reload={reload}>
        {(items) => (
          <>
            <StaffOrderList items={items} />
            {state.status === 'success' ? (
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={state.meta?.total ?? items.length}
                onChange={setPage}
              />
            ) : null}
          </>
        )}
      </AsyncBoundary>
    </>
  );
}
