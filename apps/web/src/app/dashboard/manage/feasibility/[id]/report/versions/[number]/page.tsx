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
 * One issued version of a report (ST-35.12) as the staff and the assigned experts of the project
 * read it.
 */
export default function ManageReportVersionPage() {
  const { id, number } = useParams<{ id: string; number: string }>();
  const allowed = [useCan('feasibility:manage'), useCan('feasibility:work')].some(Boolean);
  const base = `/feasibility-projects/${encodeURIComponent(id)}`;
  const { state, reload } = useApi<FeasibilityProjectDetail>(allowed ? base : null);

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="نسخه گزارش"
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
          <ReportReader
            project={project}
            side="staff"
            path={`${base}/report/versions/${encodeURIComponent(number)}`}
          />
        )}
      </AsyncBoundary>
    </>
  );
}
