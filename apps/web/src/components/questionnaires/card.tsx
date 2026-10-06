'use client';

import { Skeleton, toPersianDigits } from '@roshd/ui';
import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { progressOf, stepsOf, type ProjectQuestionnaire } from './answers';

/**
 * The questionnaire of a project on the project page of its applicant: how far it is, and the
 * way to it. An extra of that page: on an error it only offers the link.
 */
export function QuestionnaireCard({ projectId }: { projectId: string }) {
  const { state } = useApi<ProjectQuestionnaire>(
    `/feasibility-projects/${encodeURIComponent(projectId)}/questionnaire`,
  );
  const href = `/dashboard/feasibility/${projectId}/questionnaire`;
  if (state.status === 'loading') return <Skeleton className="h-24" />;

  const questionnaire = state.status === 'success' ? state.data : null;
  // Nothing to fill in and nothing to read: the card would only be in the way.
  if (
    questionnaire &&
    !questionnaire.template &&
    questionnaire.items.length === 0 &&
    !questionnaire.access.start &&
    !questionnaire.access.addItems
  ) {
    return null;
  }
  const questions = questionnaire
    ? stepsOf(questionnaire, true).flatMap((step) => step.questions)
    : [];
  const progress = questionnaire ? progressOf(questions, questionnaire.answers) : null;

  return (
    <section
      aria-labelledby="questionnaire-card-title"
      className="flex flex-col gap-2 rounded-card border border-line p-4"
    >
      <h2 id="questionnaire-card-title" className="text-base font-extrabold text-brand-900">
        پرسشنامه طرح
      </h2>
      <p className="text-sm leading-relaxed text-ink-3">
        {!questionnaire
          ? 'پرسشنامه و موارد اختصاصی پروژه را در صفحه پرسشنامه ببینید.'
          : !questionnaire.template && questionnaire.access.start
            ? 'پرسشنامه این پروژه هنوز شروع نشده است.'
            : progress && progress.total > 0
              ? `${toPersianDigits(progress.answered)} از ${toPersianDigits(progress.total)} سؤال پاسخ داده شده است${
                  progress.missing > 0
                    ? `؛ ${toPersianDigits(progress.missing)} سؤال الزامی مانده است.`
                    : '.'
                }`
              : 'توضیح، سؤال یا مدرک اختصاصی پروژه را اینجا اضافه کنید.'}
      </p>
      <div>
        <Link href={href} className="text-[15px] font-bold">
          {questionnaire?.access.answer ? 'تکمیل پرسشنامه ‹' : 'دیدن پرسشنامه ‹'}
        </Link>
      </div>
    </section>
  );
}
