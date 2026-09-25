'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TicketConversation, type TicketDetail } from '@/components/dashboard/tickets';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

export default function MyTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { state, reload } = useApi<TicketDetail>(`/tickets/${encodeURIComponent(id)}`);
  return (
    <>
      <PageTitle
        title={state.status === 'success' ? state.data.subject : 'تیکت'}
        action={
          <Link href="/dashboard/tickets" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(ticket) => (
          <TicketConversation
            ticket={ticket}
            mode="owner"
            onChanged={() => reload({ silent: true })}
          />
        )}
      </AsyncBoundary>
    </>
  );
}
