'use client';

import { ChipGroup, ErrorMessage } from '@roshd/ui';
import { TICKET_STATUS_LABELS_FA, TICKET_STATUSES } from '@roshd/validation';
import { useState } from 'react';
import { ASSIGNEE_FILTER_OPTIONS } from '@/components/dashboard/assignee';
import { useCan } from '@/components/dashboard/me-context';
import { TicketList, type TicketSummary } from '@/components/dashboard/tickets';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

const ALL = 'ALL';
const PAGE_SIZE = 20;

export default function ManageTicketsPage() {
  const allowed = useCan('tickets:read-all');
  const [status, setStatus] = useState<string>('OPEN');
  const [assignee, setAssignee] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status !== ALL) query.set('status', status);
  if (assignee !== ALL) query.set('assignee', assignee);
  const { state, reload } = useApi<TicketSummary[]>(
    allowed ? `/tickets?${query.toString()}` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle title="مدیریت تیکت‌ها" />
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
            { value: ALL, label: 'همه' },
            ...TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABELS_FA[s] })),
          ]}
        />
        <ChipGroup
          label="ارجاع"
          size="sm"
          value={assignee}
          onChange={(v) => {
            setAssignee(v);
            setPage(1);
          }}
          options={ASSIGNEE_FILTER_OPTIONS}
        />
      </div>
      <AsyncBoundary state={state} reload={reload}>
        {(items) => (
          <>
            <TicketList items={items} hrefBase="/dashboard/manage/tickets" />
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
