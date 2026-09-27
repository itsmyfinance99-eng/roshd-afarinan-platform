'use client';

import { buttonClasses, ChipGroup, EmptyState, ErrorMessage, formatDateFa } from '@roshd/ui';
import {
  CONTENT_KIND_LABELS_FA,
  CONTENT_KINDS,
  CONTENT_STATUS_LABELS_FA,
  CONTENT_STATUSES,
  type ContentKind,
  type ContentStatus,
} from '@roshd/validation';
import Link from 'next/link';
import { useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

interface Row {
  id: string;
  kind: ContentKind;
  status: ContentStatus;
  title: string;
  slug: string;
  updatedAt: string;
  isDemo: boolean;
}

const ALL = 'ALL';
const PAGE_SIZE = 20;

export default function ContentListPage() {
  const allowed = useCan('cms:write');
  const [kind, setKind] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (kind !== ALL) query.set('kind', kind);
  if (status !== ALL) query.set('status', status);
  const { state, reload } = useApi<Row[]>(allowed ? `/cms/entries?${query.toString()}` : null);

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="مدیریت محتوا"
        action={
          <Link href="/dashboard/content/new" className={buttonClasses('primary', 'sm')}>
            محتوای جدید
          </Link>
        }
      />
      <div className="mb-6 flex flex-col gap-3">
        <ChipGroup
          label="نوع"
          size="sm"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setPage(1);
          }}
          options={[
            { value: ALL, label: 'همه' },
            ...CONTENT_KINDS.map((k) => ({ value: k, label: CONTENT_KIND_LABELS_FA[k] })),
          ]}
        />
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
              title="محتوایی یافت نشد"
              description="اولین مقاله یا مدخل دانشنامه را ایجاد کنید."
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/dashboard/content/${row.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line p-4 text-ink no-underline hover:border-line-hover hover:text-ink"
                    >
                      <span className="flex flex-col gap-1">
                        <span className="font-bold">{row.title}</span>
                        <span className="text-[13px] text-ink-5">
                          {CONTENT_KIND_LABELS_FA[row.kind]} · {formatDateFa(row.updatedAt)}
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
    </>
  );
}
