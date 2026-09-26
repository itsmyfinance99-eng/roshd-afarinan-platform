'use client';

import { ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AssigneeName, AssigneePicker } from '@/components/dashboard/assignee';
import { useCan } from '@/components/dashboard/me-context';
import { TicketConversation, type TicketDetail } from '@/components/dashboard/tickets';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

export default function ManageTicketPage() {
  const { id } = useParams<{ id: string }>();
  const canRead = useCan('tickets:read-all');
  const canReply = useCan('tickets:reply');
  const { state, reload } = useApi<TicketDetail>(
    canRead ? `/tickets/${encodeURIComponent(id)}` : null,
  );

  if (!canRead) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title={state.status === 'success' ? state.data.subject : 'تیکت'}
        action={
          <Link href="/dashboard/manage/tickets" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(ticket) => (
          <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
            <TicketConversation
              ticket={ticket}
              mode={canReply ? 'staff' : 'owner'}
              onChanged={() => reload({ silent: true })}
            />
            <div>
              {canReply ? (
                <AssigneePicker
                  resource="/tickets"
                  id={ticket.id}
                  current={ticket.assignee}
                  onChanged={() => reload({ silent: true })}
                />
              ) : (
                <p className="text-[15px]">
                  <span className="text-ink-5">کارشناس: </span>
                  <AssigneeName assignee={ticket.assignee} />
                </p>
              )}
            </div>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
