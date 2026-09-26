'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { OrderDetail, type OrderView } from '@/components/dashboard/orders';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

function OrderContent() {
  const { id } = useParams<{ id: string }>();
  const hint = useSearchParams().get('payment');
  const { state, reload } = useApi<OrderView>(`/orders/${encodeURIComponent(id)}`);
  return (
    <AsyncBoundary state={state} reload={reload}>
      {(order) => (
        <OrderDetail order={order} paymentHint={hint} onChanged={() => reload({ silent: true })} />
      )}
    </AsyncBoundary>
  );
}

export default function OrderPage() {
  return (
    <>
      <PageTitle
        title="جزئیات سفارش"
        action={
          <Link href="/dashboard/orders" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <Suspense>
        <OrderContent />
      </Suspense>
    </>
  );
}
