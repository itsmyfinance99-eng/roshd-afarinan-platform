'use client';

import { buttonClasses } from '@roshd/ui';
import Link from 'next/link';
import { TicketList, type TicketSummary } from '@/components/dashboard/tickets';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

export default function MyTicketsPage() {
  const { state, reload } = useApi<TicketSummary[]>('/tickets/mine?pageSize=50');
  return (
    <>
      <PageTitle
        title="پشتیبانی"
        action={
          <Link href="/dashboard/tickets/new" className={buttonClasses('primary', 'sm')}>
            تیکت جدید
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(items) => <TicketList items={items} hrefBase="/dashboard/tickets" />}
      </AsyncBoundary>
    </>
  );
}
