'use client';

import { ChipGroup, ErrorMessage, FieldShell, Select } from '@roshd/ui';
import {
  FEASIBILITY_STATUS_LABELS_FA,
  FEASIBILITY_STATUSES,
  type FeasibilityStatus,
} from '@roshd/validation';
import { useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import { ProjectList } from '@/components/feasibility/parts';
import type { FeasibilityProjectItem } from '@/components/feasibility/types';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 20;
type Scope = 'all' | 'assigned';
const SCOPE_LABELS: Record<Scope, string> = { all: 'همه پروژه‌ها', assigned: 'سپرده‌شده به من' };

export default function ManageFeasibilityProjectsPage() {
  const canManage = useCan('feasibility:manage');
  const canWork = useCan('feasibility:work');
  const scopes: Scope[] = [
    ...(canManage ? (['all'] as const) : []),
    ...(canWork ? (['assigned'] as const) : []),
  ];
  const [chosen, setChosen] = useState<Scope | null>(null);
  const [status, setStatus] = useState<FeasibilityStatus | ''>('');
  const [page, setPage] = useState(1);
  const scope = chosen ?? scopes[0];
  const { state, reload } = useApi<FeasibilityProjectItem[]>(
    scope
      ? `/feasibility-projects?scope=${scope}&page=${page}&pageSize=${PAGE_SIZE}${status ? `&status=${status}` : ''}`
      : null,
  );

  if (!scope) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle title="پروژه‌های امکان‌سنجی" />
      <div className="mb-6 flex flex-wrap items-end gap-4">
        {scopes.length > 1 ? (
          <ChipGroup
            label="دامنه فهرست"
            options={scopes.map((value) => ({ value, label: SCOPE_LABELS[value] }))}
            value={scope}
            onChange={(value) => {
              setChosen(value);
              setPage(1);
            }}
          />
        ) : null}
        <FieldShell id="fp-status-filter" label="وضعیت" className="w-56">
          <Select
            id="fp-status-filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as FeasibilityStatus | '');
              setPage(1);
            }}
          >
            <option value="">همه وضعیت‌ها</option>
            {FEASIBILITY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {FEASIBILITY_STATUS_LABELS_FA[value]}
              </option>
            ))}
          </Select>
        </FieldShell>
      </div>
      <AsyncBoundary state={state} reload={reload}>
        {(items) => (
          <>
            <ProjectList
              items={items}
              hrefBase="/dashboard/manage/feasibility"
              empty={{
                title: 'پروژه‌ای یافت نشد',
                description:
                  scope === 'assigned'
                    ? 'پروژه‌هایی که به شما سپرده می‌شوند اینجا نمایش داده می‌شوند.'
                    : 'پروژه‌های متقاضیان و پروژه‌های ساخته‌شده از درخواست‌ها اینجا نمایش داده می‌شوند.',
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
