'use client';

import { ErrorMessage, formatDateFa } from '@roshd/ui';
import { CONTENT_STATUS_LABELS_FA, type ContentStatus } from '@roshd/validation';
import Link from 'next/link';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { EDITABLE_PAGES } from '@/content/pages';
import { useApi } from '@/lib/use-api';

interface Row {
  slug: string;
  title: string;
  status: ContentStatus;
  updatedAt: string;
}

export default function InstitutionalPagesPage() {
  const allowed = useCan('cms:write');
  const { state, reload } = useApi<Row[]>(allowed ? '/cms/pages' : null);
  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle title="صفحات سازمانی" />
      <AsyncBoundary state={state} reload={reload}>
        {(rows) => (
          <ul className="flex flex-col gap-2">
            {EDITABLE_PAGES.map((p) => {
              const saved = rows.find((r) => r.slug === p.slug);
              return (
                <li key={p.slug}>
                  <Link
                    href={`/dashboard/pages/${p.slug}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line p-4 text-ink no-underline hover:border-line-hover hover:text-ink"
                  >
                    <span className="flex flex-col gap-1">
                      <span className="font-bold">{p.label}</span>
                      <span className="text-[13px] text-ink-5" dir="ltr">
                        {p.path}
                      </span>
                    </span>
                    <span className="rounded-chip bg-surface-2 px-2 py-[3px] text-xs font-bold text-ink-3">
                      {saved
                        ? `${CONTENT_STATUS_LABELS_FA[saved.status]} · ${formatDateFa(saved.updatedAt)}`
                        : 'متن پیش‌فرض سایت'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </AsyncBoundary>
    </>
  );
}
