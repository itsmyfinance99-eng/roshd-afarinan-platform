'use client';

import { ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { ReportComposer, ReportVersions } from '@/components/feasibility/report-composer';
import type { ReportDraft, ReportVersionSummary } from '@/components/feasibility/report-types';
import type { FeasibilityProjectDetail } from '@/components/feasibility/types';
import { useApi } from '@/lib/use-api';

/**
 * The report of a study as its staff and its assigned experts work on it (ST-35.12): the draft
 * with its structure, its calculation run and its chapters, and the versions it was issued in.
 */
export default function ManageProjectReportPage() {
  const { id } = useParams<{ id: string }>();
  const allowed = [useCan('feasibility:manage'), useCan('feasibility:work')].some(Boolean);
  const base = allowed ? `/feasibility-projects/${encodeURIComponent(id)}` : null;
  const project = useApi<FeasibilityProjectDetail>(base);
  const draft = useApi<ReportDraft>(base ? `${base}/report` : null);
  const versions = useApi<ReportVersionSummary[]>(base ? `${base}/report/versions` : null);

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="گزارش مطالعه"
        action={
          <Link href={`/dashboard/manage/feasibility/${id}`} className="text-sm no-underline">
            بازگشت به پروژه ‹
          </Link>
        }
      />
      <AsyncBoundary state={project.state} reload={project.reload}>
        {(detail) => (
          <div className="flex flex-col gap-8">
            <p className="text-[15px] text-ink-5">
              {detail.title} · <span dir="ltr">{detail.code}</span>
            </p>
            <AsyncBoundary state={draft.state} reload={draft.reload}>
              {(data) => (
                <ReportComposer
                  project={detail}
                  draft={data}
                  onChanged={() => draft.reload({ silent: true })}
                  onIssued={() => versions.reload({ silent: true })}
                />
              )}
            </AsyncBoundary>
            <AsyncBoundary state={versions.state} reload={versions.reload}>
              {(list) => <ReportVersions projectId={id} versions={list} />}
            </AsyncBoundary>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
