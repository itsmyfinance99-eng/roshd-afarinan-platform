'use client';

import { buttonClasses, ChipGroup, EmptyState, ErrorMessage, formatDateFa } from '@roshd/ui';
import { CONTENT_STATUS_LABELS_FA, CONTENT_STATUSES } from '@roshd/validation';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { CatalogRecord } from '@/components/dashboard/catalog/catalog-editor';
import {
  CatalogTabs,
  CategoryQuickAdd,
  InstructorQuickAdd,
} from '@/components/dashboard/catalog/catalog-parts';
import { CATALOGS, isCatalogType } from '@/components/dashboard/catalog/config';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

const ALL = 'ALL';
const PAGE_SIZE = 20;

export default function CatalogListPage() {
  const { type } = useParams<{ type: string }>();
  const allowed = useCan('catalog:manage');
  const canWriteCms = useCan('cms:write');
  const [status, setStatus] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const config = isCatalogType(type) ? CATALOGS[type] : null;
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status !== ALL) query.set('status', status);
  const { state, reload } = useApi<CatalogRecord[]>(
    allowed && config ? `${config.apiBase}?${query.toString()}` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;
  if (!config) return <ErrorMessage>این کاتالوگ وجود ندارد.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title={`مدیریت ${config.title}`}
        action={
          <Link
            href={`/dashboard/catalog/${config.type}/new`}
            className={buttonClasses('primary', 'sm')}
          >
            {config.singular} جدید
          </Link>
        }
      />
      <CatalogTabs active={config.type} />
      <div className="mb-6">
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
            ...CONTENT_STATUSES.map((s) => ({ value: s, label: CONTENT_STATUS_LABELS_FA[s] })),
          ]}
        />
      </div>
      <AsyncBoundary state={state} reload={reload}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              title="موردی یافت نشد"
              description={`اولین ${config.singular} را به‌صورت پیش‌نویس ایجاد کنید.`}
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/dashboard/catalog/${config.type}/${row.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line p-4 text-ink no-underline hover:border-line-hover hover:text-ink"
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="font-bold">{row.title}</span>
                        <span className="text-[13px] text-ink-5">
                          <span dir="ltr">{row.slug}</span> · {formatDateFa(row.updatedAt)}
                          {row.isDemo ? ' · نمونه نمایشی' : ''}
                        </span>
                      </span>
                      <span className="rounded-chip bg-surface-2 px-2 py-[3px] text-xs font-bold text-ink-3">
                        {CONTENT_STATUS_LABELS_FA[row.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {state.status === 'success' ? (
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={state.meta?.total ?? rows.length}
                  onChange={setPage}
                />
              ) : null}
            </>
          )
        }
      </AsyncBoundary>
      <div className="mt-8 flex flex-col gap-3">
        {config.type === 'courses' ? <InstructorQuickAdd /> : null}
        {config.categoryScope && canWriteCms ? (
          <CategoryQuickAdd scope={config.categoryScope} />
        ) : null}
      </div>
    </>
  );
}
