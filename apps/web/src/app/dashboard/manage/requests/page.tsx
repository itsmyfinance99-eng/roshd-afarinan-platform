'use client';

import { ChipGroup, ErrorMessage } from '@roshd/ui';
import {
  SERVICE_REQUEST_STATUS_LABELS_FA,
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_TYPE_LABELS_FA,
  SERVICE_REQUEST_TYPES,
} from '@roshd/validation';
import { useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import type { ServiceRequestItem } from '@/components/dashboard/types';
import { AsyncBoundary, PageTitle, Pagination, RequestList } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 20;
const ALL = 'ALL';

export default function ManageRequestsPage() {
  const allowed = useCan('requests:read-all');
  const [status, setStatus] = useState<string>('NEW');
  const [type, setType] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status !== ALL) query.set('status', status);
  if (type !== ALL) query.set('type', type);
  const { state, reload } = useApi<ServiceRequestItem[]>(
    allowed ? `/service-requests?${query.toString()}` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle title="مدیریت درخواست‌ها" />
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
            ...SERVICE_REQUEST_STATUSES.map((s) => ({
              value: s,
              label: SERVICE_REQUEST_STATUS_LABELS_FA[s],
            })),
          ]}
        />
        <ChipGroup
          label="نوع"
          size="sm"
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={[
            { value: ALL, label: 'همه انواع' },
            ...SERVICE_REQUEST_TYPES.map((t) => ({
              value: t,
              label: SERVICE_REQUEST_TYPE_LABELS_FA[t],
            })),
          ]}
        />
      </div>
      <AsyncBoundary state={state} reload={reload}>
        {(items) => (
          <>
            <RequestList items={items} hrefBase="/dashboard/manage/requests" showRequester />
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
