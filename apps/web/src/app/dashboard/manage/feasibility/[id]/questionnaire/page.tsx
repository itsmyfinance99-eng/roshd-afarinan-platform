'use client';

import { EmptyState, ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { hasOwnStep, type ProjectQuestionnaire } from '@/components/questionnaires/answers';
import { QuestionnaireForm } from '@/components/questionnaires/fill';
import { useApi } from '@/lib/use-api';

function Body({ projectId, initial }: { projectId: string; initial: ProjectQuestionnaire }) {
  const [questionnaire, setQuestionnaire] = useState(initial);
  if (questionnaire.template === null && !hasOwnStep(questionnaire)) {
    return (
      <EmptyState
        title="پرسشنامه‌ای برای دیدن نیست"
        description="متقاضی هنوز پرسشنامه این پروژه را شروع نکرده و مورد اختصاصی‌ای هم ندارد."
      />
    );
  }
  return (
    <QuestionnaireForm
      projectId={projectId}
      questionnaire={questionnaire}
      onQuestionnaire={setQuestionnaire}
      viewer="staff"
    />
  );
}

/**
 * The questionnaire of a project as staff and its experts read it (ST-35.07): the answers of
 * the applicant, the documents, and — for staff, while the intake review lasts — the way to add
 * a question, a document or a note of their own to it.
 */
export default function ManageProjectQuestionnairePage() {
  const { id } = useParams<{ id: string }>();
  const allowed = [useCan('feasibility:manage'), useCan('feasibility:work')].some(Boolean);
  const { state, reload } = useApi<ProjectQuestionnaire>(
    allowed ? `/feasibility-projects/${encodeURIComponent(id)}/questionnaire` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="پرسشنامه و پاسخ‌های متقاضی"
        action={
          <Link href={`/dashboard/manage/feasibility/${id}`} className="text-sm no-underline">
            بازگشت به پروژه ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(questionnaire) => <Body projectId={id} initial={questionnaire} />}
      </AsyncBoundary>
    </>
  );
}
