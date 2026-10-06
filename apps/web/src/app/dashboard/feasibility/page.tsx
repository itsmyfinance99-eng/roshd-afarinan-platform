'use client';

import { buttonClasses } from '@roshd/ui';
import Link from 'next/link';
import { useState } from 'react';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import { ProjectList } from '@/components/feasibility/parts';
import type { FeasibilityProjectItem } from '@/components/feasibility/types';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 10;

export default function MyFeasibilityProjectsPage() {
  const [page, setPage] = useState(1);
  const { state, reload } = useApi<FeasibilityProjectItem[]>(
    `/feasibility-projects?page=${page}&pageSize=${PAGE_SIZE}`,
  );

  return (
    <>
      <PageTitle
        title="پروژه‌های امکان‌سنجی من"
        action={
          <Link href="/dashboard/feasibility/new" className={buttonClasses('primary', 'sm')}>
            پروژه جدید
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(items) => (
          <>
            <ProjectList
              items={items}
              hrefBase="/dashboard/feasibility"
              empty={{
                title: 'هنوز پروژه‌ای ندارید',
                description:
                  'پروژه امکان‌سنجی را به‌صورت پیش‌نویس بسازید، مشخصاتش را کامل کنید و برای بررسی بفرستید.',
                action: (
                  <Link href="/dashboard/feasibility/new" className="font-bold no-underline">
                    ساخت اولین پروژه ‹
                  </Link>
                ),
              }}
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
