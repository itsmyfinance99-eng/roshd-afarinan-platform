'use client';

import { ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { ProjectContract } from '@/components/feasibility/contract';
import { ProjectDocuments } from '@/components/feasibility/documents';
import { EstimateFacts, EstimateForm } from '@/components/feasibility/estimate';
import { ProjectExperts } from '@/components/feasibility/experts';
import { ReviewActions } from '@/components/feasibility/review';
import { hasReview, ReviewSteps, ReviewThreads } from '@/components/feasibility/review-cycle';
import { ProjectAttachments, ProjectFacts, ProjectTimeline } from '@/components/feasibility/parts';
import type { FeasibilityProjectDetail } from '@/components/feasibility/types';
import { InternalNotes, ProjectModel } from '@/components/feasibility/workspace';
import { useApi } from '@/lib/use-api';

/**
 * A project as staff and its experts see it, with the steps of the intake review (ST-35.07),
 * the cost estimate (ST-35.08) and the contract (ST-35.09) for staff, and the workspace of the
 * staff and the assigned experts (ST-35.10): the answers, the documents, the financial model, the
 * experts and the internal notes, and the review cycle with its comments (ST-35.11). The later
 * steps join in their own stories.
 */
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
        {(project) => {
          // On a project of their own, staff are its applicant and nothing else: the API leaves
          // out what only the staff and the experts read.
          const own = project.applicant === undefined;
          return (
            <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
              <div className="flex min-w-0 flex-col gap-6">
                <ProjectFacts project={project} />
                {project.costEstimate ? <EstimateFacts estimate={project.costEstimate} /> : null}
                <EstimateForm project={project} onChanged={() => reload({ silent: true })} />
                {/* The contract is between the applicant and the company; an expert does not read it. */}
                {canManage ? (
                  <ProjectContract
                    project={project}
                    side={own ? 'applicant' : 'staff'}
                    onChanged={() => reload({ silent: true })}
                  />
                ) : null}
                <ReviewActions project={project} onChanged={() => reload({ silent: true })} />
                {own ? null : (
                  <ReviewSteps
                    project={project}
                    side="staff"
                    onChanged={() => reload({ silent: true })}
                  />
                )}
                <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[15px]">
                  <dt className="text-ink-5">متقاضی</dt>
                  <dd>{own ? 'خود شما' : (project.applicant?.fullName ?? 'کاربر حذف‌شده')}</dd>
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
                <p className="text-[15px]">
                  <Link
                    href={`/dashboard/manage/feasibility/${project.id}/questionnaire`}
                    className="font-bold"
                  >
                    پرسشنامه و پاسخ‌های متقاضی ‹
                  </Link>
                </p>
                <section aria-labelledby="documents-title" className="flex flex-col gap-3">
                  <h2 id="documents-title" className="text-base font-extrabold text-brand-900">
                    مدارک پروژه
                  </h2>
                  <ProjectDocuments
                    projectId={project.id}
                    emptyText="پرسشنامه این پروژه مدرک یا فایلی نمی‌خواهد یا هنوز شروع نشده است."
                  />
                </section>
                {own ? null : (
                  <>
                    <ProjectModel project={project} onChanged={() => reload({ silent: true })} />
                    <ProjectExperts project={project} onChanged={() => reload({ silent: true })} />
                    {hasReview(project) ? (
                      <ReviewThreads
                        key={`threads-${project.status}`}
                        project={project}
                        side="staff"
                      />
                    ) : null}
                    <InternalNotes project={project} />
                  </>
                )}
              </div>
              <section aria-labelledby="timeline-title">
                <h2 id="timeline-title" className="mb-4 text-base font-extrabold text-brand-900">
                  تاریخچه وضعیت
                </h2>
                <ProjectTimeline events={project.events} />
              </section>
            </div>
          );
        }}
      </AsyncBoundary>
    </>
  );
}
