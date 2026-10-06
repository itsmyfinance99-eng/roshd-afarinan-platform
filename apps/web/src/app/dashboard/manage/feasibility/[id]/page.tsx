'use client';

import { ErrorMessage, formatDateFa } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { ProjectDocuments } from '@/components/feasibility/documents';
import { ProjectAttachments, ProjectFacts, ProjectTimeline } from '@/components/feasibility/parts';
import type { FeasibilityProjectDetail } from '@/components/feasibility/types';
import { useApi } from '@/lib/use-api';

/** A project as staff and its experts see it. The review steps join in their own stories. */
export default function ManageFeasibilityProjectPage() {
  const { id } = useParams<{ id: string }>();
  const canManage = useCan('feasibility:manage');
  const canWork = useCan('feasibility:work');
  const canReadRequests = useCan('requests:read-all');
  const allowed = canManage || canWork;
  const { state, reload } = useApi<FeasibilityProjectDetail>(
    allowed ? `/feasibility-projects/${encodeURIComponent(id)}` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="پروژه امکان‌سنجی"
        action={
          <Link href="/dashboard/manage/feasibility" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(project) => (
          <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
            <div className="flex min-w-0 flex-col gap-6">
              <ProjectFacts project={project} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[15px]">
                <dt className="text-ink-5">متقاضی</dt>
                <dd>{project.applicant?.fullName ?? 'کاربر حذف‌شده'}</dd>
                {project.sourceRequest ? (
                  <>
                    <dt className="text-ink-5">درخواست اولیه</dt>
                    <dd dir="ltr" className="text-right">
                      {canReadRequests ? (
                        <Link href={`/dashboard/manage/requests/${project.sourceRequest.id}`}>
                          {project.sourceRequest.trackingCode}
                        </Link>
                      ) : (
                        project.sourceRequest.trackingCode
                      )}
                    </dd>
                  </>
                ) : null}
              </dl>
              <ProjectAttachments project={project} />
              <section aria-labelledby="documents-title" className="flex flex-col gap-3">
                <h2 id="documents-title" className="text-base font-extrabold text-brand-900">
                  مدارک پروژه
                </h2>
                <ProjectDocuments
                  projectId={project.id}
                  emptyText="پرسشنامه این پروژه مدرک یا فایلی نمی‌خواهد یا هنوز شروع نشده است."
                />
              </section>
              <section aria-labelledby="experts-title">
                <h2 id="experts-title" className="mb-3 text-base font-extrabold text-brand-900">
                  کارشناسان پروژه
                </h2>
                {project.experts?.length ? (
                  <ul className="flex flex-col gap-2 text-[15px]">
                    {project.experts.map(({ expert, since }) => (
                      <li key={expert.id}>
                        {expert.fullName}
                        <span className="text-[13px] text-ink-5"> · از {formatDateFa(since)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] text-ink-5">
                    هنوز کارشناسی به این پروژه سپرده نشده است.
                  </p>
                )}
              </section>
            </div>
            <section aria-labelledby="timeline-title">
              <h2 id="timeline-title" className="mb-4 text-base font-extrabold text-brand-900">
                تاریخچه وضعیت
              </h2>
              <ProjectTimeline events={project.events} />
            </section>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
