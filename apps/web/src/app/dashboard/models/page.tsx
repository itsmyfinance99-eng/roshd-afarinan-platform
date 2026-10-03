'use client';

import { PageTitle } from '@/components/dashboard/ui';
import { ModelList } from '@/components/models/model-list';

export default function FinancialModelsPage() {
  return (
    <>
      <PageTitle title="مدل‌های مالی" />
      <ModelList />
    </>
  );
}
