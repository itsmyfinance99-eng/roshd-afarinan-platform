'use client';

import { Notice } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { ModelEditor } from '@/components/models/editor';
import type { FinancialModelDetail } from '@/components/models/types';
import { useApi } from '@/lib/use-api';

export default function FinancialModelPage() {
  const { id } = useParams<{ id: string }>();
  const { state, reload } = useApi<FinancialModelDetail>(
    `/financial-models/${encodeURIComponent(id)}`,
  );
  // The model of a feasibility project is opened from its project, and leads back to it.
  const projectId = state.status === 'success' ? state.data.projectId : null;
  return (
    <>
      <PageTitle
        title="ورودی‌های مدل مالی"
        action={
          projectId ? (
            <Link
              href={`/dashboard/manage/feasibility/${projectId}`}
              className="text-sm no-underline"
            >
              بازگشت به پروژه ‹
            </Link>
          ) : (
            <Link href="/dashboard/models" className="text-sm no-underline">
              بازگشت به فهرست ‹
            </Link>
          )
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(model) => (
          <>
            {model.access.edit ? null : (
              <Notice className="mb-6">
                پروژه این مدل بایگانی شده است. ورودی‌ها و اجراهای آن خوانده می‌شوند، اما تغییر تازه
                یا اجرای تازه‌ای ثبت نمی‌شود.
              </Notice>
            )}
            {/* A reload after a conflict brings a new version: the editor starts again from it. */}
            <ModelEditor key={`${model.id}:${model.version}`} model={model} onReload={reload} />
          </>
        )}
      </AsyncBoundary>
    </>
  );
}
