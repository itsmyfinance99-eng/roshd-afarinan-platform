'use client';

import { buttonClasses } from '@roshd/ui';
import Link from 'next/link';
import { useState } from 'react';
import type { ServiceRequestItem } from '@/components/dashboard/types';
import { AsyncBoundary, PageTitle, Pagination, RequestList } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 10;

export default function MyRequestsPage() {
  const [page, setPage] = useState(1);
  const { state, reload } = useApi<ServiceRequestItem[]>(
    `/service-requests/mine?page=${page}&pageSize=${PAGE_SIZE}`,
  );

  return (
    <>
      <PageTitle
        title="درخواست‌های من"
        action={
          <Link href="/feasibility/request" className={buttonClasses('primary', 'sm')}>
            درخواست جدید
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(items) => (
          <>
            <RequestList
              items={items}
              hrefBase="/dashboard/requests"
              emptyAction={
                <Link href="/feasibility/request" className="font-bold no-underline">
                  ثبت اولین درخواست ‹
                </Link>
              }
            />
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
