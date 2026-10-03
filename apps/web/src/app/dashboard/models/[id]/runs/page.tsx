'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageTitle } from '@/components/dashboard/ui';
import { RunList } from '@/components/models/results/run-list';

export default function CalculationRunsPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <PageTitle
        title="اجراهای محاسبه"
        action={
          <Link href={`/dashboard/models/${id}`} className="text-sm no-underline">
            بازگشت به ورودی‌های مدل ‹
          </Link>
        }
      />
      <RunList modelId={id} />
    </>
  );
}
