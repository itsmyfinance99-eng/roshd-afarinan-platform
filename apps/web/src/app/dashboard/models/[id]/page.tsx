'use client';

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
  return (
    <>
      <PageTitle
        title="ورودی‌های مدل مالی"
        action={
          <Link href="/dashboard/models" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(model) => (
          // A reload after a conflict brings a new version: the editor starts again from it.
          <ModelEditor key={`${model.id}:${model.version}`} model={model} onReload={reload} />
        )}
      </AsyncBoundary>
    </>
  );
}
