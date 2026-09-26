'use client';

import { useState } from 'react';
import { OrderList, type OrderView } from '@/components/dashboard/orders';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 20;

export default function MyOrdersPage() {
  const [page, setPage] = useState(1);
  const { state, reload } = useApi<OrderView[]>(`/orders/mine?page=${page}&pageSize=${PAGE_SIZE}`);
  return (
    <>
      <PageTitle title="سفارش‌های من" />
      <AsyncBoundary state={state} reload={reload}>
        {(items) => (
          <>
            <OrderList items={items} />
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
