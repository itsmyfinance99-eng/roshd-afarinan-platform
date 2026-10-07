'use client';

import { ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { ReportComposer, ReportVersions } from '@/components/feasibility/report-composer';
import type { ReportDraft, ReportVersionSummary } from '@/components/feasibility/report-types';
import type { FeasibilityProjectDetail } from '@/components/feasibility/types';
import { apiFetch } from '@/lib/api-client';
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

  /** The draft as it was read again after a change; until then the first answer stands. */
  const [fresh, setFresh] = useState<ReportDraft | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Read without the loading state: the forms stay mounted, and so does a text that is being
  // written when the read fails.
  const asked = useRef(0);
  const refresh = async () => {
    const mine = ++asked.current;
    const result = await apiFetch<ReportDraft>(`${base}/report`);
    // Of two reads on their way, the one that was asked for last counts.
    if (mine !== asked.current) return;
    if (result.ok) setFresh(result.data);
    setRefreshError(
      result.ok ? null : `پیش‌نویس دوباره خوانده نشد (${result.message}). صفحه را تازه کنید.`,
    );
  };

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
                <>
                  {refreshError ? <ErrorMessage>{refreshError}</ErrorMessage> : null}
                  <ReportComposer
                    project={detail}
                    draft={fresh ?? data}
                    onChanged={() => void refresh()}
                    onIssued={() => versions.reload({ silent: true })}
                  />
                </>
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
