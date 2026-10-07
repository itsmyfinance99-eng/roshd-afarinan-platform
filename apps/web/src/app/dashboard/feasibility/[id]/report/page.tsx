'use client';

import { EmptyState } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { ReportReader } from '@/components/feasibility/report-reader';
import type { ReportVersionSummary } from '@/components/feasibility/report-types';
import type { FeasibilityProjectDetail } from '@/components/feasibility/types';
import { useApi } from '@/lib/use-api';

/**
 * The report of a study as its applicant reads it (ST-35.12): the newest version that was
 * issued, from the day the study is with them for review. The draft is never shown here.
 */
export default function ProjectReportPage() {
  const { id } = useParams<{ id: string }>();
  const base = `/feasibility-projects/${encodeURIComponent(id)}`;
  const project = useApi<FeasibilityProjectDetail>(base);
  const versions = useApi<ReportVersionSummary[]>(`${base}/report/versions`);

  return (
    <>
      <PageTitle
        title="گزارش مطالعه"
        action={
          <Link href={`/dashboard/feasibility/${id}`} className="text-sm no-underline">
            بازگشت به پروژه ‹
          </Link>
        }
      />
      <AsyncBoundary state={project.state} reload={project.reload}>
        {(detail) => (
          <AsyncBoundary state={versions.state} reload={versions.reload}>
            {(list) =>
              list[0] ? (
                <ReportReader
                  project={detail}
                  side="applicant"
                  path={`${base}/report/versions/${list[0].number}`}
                />
              ) : (
                <EmptyState
                  title="گزارشی برای خواندن نیست"
                  description="هنوز نسخه‌ای از گزارش این مطالعه برای شما صادر نشده است. هنگامی که مطالعه برای بازبینی نزد شما بیاید، گزارش را اینجا می‌خوانید."
                />
              )
            }
          </AsyncBoundary>
        )}
      </AsyncBoundary>
    </>
  );
}
