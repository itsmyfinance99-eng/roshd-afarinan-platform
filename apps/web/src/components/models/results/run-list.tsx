'use client';

import { EmptyState, formatDateTimeFa, Tag, toPersianDigits } from '@roshd/ui';
import Link from 'next/link';
import { useState } from 'react';
import { AsyncBoundary, Pagination } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';
import type { CalculationRunSummary } from '../types';

const PAGE_SIZE = 20;

/** The stored calculation runs of a model, newest first. */
export function RunList({ modelId }: { modelId: string }) {
  const [page, setPage] = useState(1);
  const base = `/financial-models/${encodeURIComponent(modelId)}/runs`;
  const { state, reload } = useApi<CalculationRunSummary[]>(
    `${base}?page=${page}&pageSize=${PAGE_SIZE}`,
  );
  return (
    <AsyncBoundary state={state} reload={reload}>
      {(runs) =>
        runs.length === 0 ? (
          <EmptyState
            title="هنوز اجرایی ثبت نشده است"
            description="در صفحه ورودی‌های مدل، پس از کامل شدن ورودی‌ها «ثبت اجرای محاسبه» را بزنید."
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {runs.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/dashboard/models/${modelId}/runs/${run.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4 text-ink no-underline hover:border-line-hover hover:text-ink"
                  >
                    <span className="flex flex-col gap-1">
                      <span className="text-[15px] font-bold">
                        اجرای شماره {toPersianDigits(run.number)}
                      </span>
                      <span className="text-[13px] text-ink-5">
                        {formatDateTimeFa(run.createdAt)} · نسخه ورودی{' '}
                        {toPersianDigits(run.modelVersion)} · موتور{' '}
                        <span dir="ltr">{run.engineVersion}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {run.canApprove ? <Tag>در انتظار تأیید شما</Tag> : null}
                      {run.approvedAt ? (
                        <Tag className="border-success-line text-success-fg">تأییدشده</Tag>
                      ) : (
                        <Tag>تأییدنشده</Tag>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={state.status === 'success' ? (state.meta?.total ?? runs.length) : 0}
              onChange={setPage}
            />
          </>
        )
      }
    </AsyncBoundary>
  );
}
