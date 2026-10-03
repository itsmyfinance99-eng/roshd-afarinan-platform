'use client';

import { toPersianDigits } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { RunView } from '@/components/models/results/run-view';
import type { CalculationRunDetail } from '@/components/models/types';
import { useApi } from '@/lib/use-api';

export default function CalculationRunPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const { state, reload } = useApi<CalculationRunDetail>(
    `/financial-models/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`,
  );
  return (
    <>
      <PageTitle
        title={
          state.status === 'success'
            ? `نتایج اجرای شماره ${toPersianDigits(state.data.number)}`
            : 'نتایج اجرا'
        }
        action={
          <Link href={`/dashboard/models/${id}/runs`} className="text-sm no-underline">
            همه اجراها ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(run) => <RunView modelId={id} run={run} onChanged={() => reload({ silent: true })} />}
      </AsyncBoundary>
    </>
  );
}
