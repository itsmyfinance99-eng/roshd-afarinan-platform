'use client';

import { ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { ReportReader } from '@/components/feasibility/report-reader';
import type { FeasibilityProjectDetail } from '@/components/feasibility/types';
import { useApi } from '@/lib/use-api';

/**
 * The draft of a report as it would be issued now (ST-35.12), with what is still missing; for
 * the staff and the assigned experts of the project.
 */
export default function ManageReportPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const allowed = [useCan('feasibility:manage'), useCan('feasibility:work')].some(Boolean);
  const base = `/feasibility-projects/${encodeURIComponent(id)}`;
  const { state, reload } = useApi<FeasibilityProjectDetail>(allowed ? base : null);

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="پیش‌نمایش گزارش"
        action={
          <Link
            href={`/dashboard/manage/feasibility/${id}/report`}
            className="text-sm no-underline"
          >
            بازگشت به گزارش ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(project) => (
          <ReportReader project={project} side="staff" path={`${base}/report/preview`} />
        )}
      </AsyncBoundary>
    </>
  );
}
