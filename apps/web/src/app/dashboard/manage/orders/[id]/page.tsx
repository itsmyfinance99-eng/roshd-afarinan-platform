'use client';

import { ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCan } from '@/components/dashboard/me-context';
import { StaffOrderDetail, type StaffOrderView } from '@/components/dashboard/orders';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

export default function ManageOrderPage() {
  const allowed = useCan('orders:read-all');
  const { id } = useParams<{ id: string }>();
  const { state, reload } = useApi<StaffOrderView>(
    allowed ? `/orders/${encodeURIComponent(id)}` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="جزئیات سفارش"
        action={
          <Link href="/dashboard/manage/orders" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(order) => <StaffOrderDetail order={order} />}
      </AsyncBoundary>
    </>
  );
}
