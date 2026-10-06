'use client';

import { Button, EmptyState, ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import type { ProjectQuestionnaire } from '@/components/questionnaires/answers';
import { QuestionnaireForm } from '@/components/questionnaires/fill';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

/** Before the questionnaire is started: the way to start it, or why there is none. */
function Start({
  projectId,
  questionnaire,
  onStarted,
}: {
  projectId: string;
  questionnaire: ProjectQuestionnaire;
  onStarted: (questionnaire: ProjectQuestionnaire) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    const result = await apiFetch<ProjectQuestionnaire>(
      `/feasibility-projects/${projectId}/questionnaire/start`,
      { method: 'POST', body: {} },
    );
    setBusy(false);
    if (result.ok) onStarted(result.data);
    else setError(result.message);
  };

  if (!questionnaire.access.start) {
    return (
      <EmptyState
        title="پرسشنامه‌ای برای شروع نیست"
        description={
          questionnaire.access.answer
            ? 'هنوز پرسشنامه‌ای برای این پروژه منتشر نشده است. می‌توانید توضیح، سؤال یا مدرک اختصاصی به پروژه اضافه کنید.'
            : 'برای این پروژه پرسشنامه‌ای شروع نشده است.'
        }
      />
    );
  }
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border border-line-strong bg-surface p-5">
      <h2 className="text-base font-extrabold text-brand-900">شروع پرسشنامه</h2>
      <p className="text-[15px] leading-relaxed text-ink-3">
        پرسشنامه طرح را مرحله‌به‌مرحله پر کنید. پاسخ‌ها خودکار ذخیره می‌شوند و هر وقت خواستید
        می‌توانید ادامه دهید. با شروع، پروژه همین نسخه از پرسشنامه را تا پایان نگه می‌دارد.
      </p>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <Button disabled={busy} onClick={() => void start()}>
        {busy ? 'در حال شروع…' : 'شروع پرسشنامه'}
      </Button>
    </div>
  );
}

function Body({ projectId, initial }: { projectId: string; initial: ProjectQuestionnaire }) {
  const [questionnaire, setQuestionnaire] = useState(initial);
  // The link of a refused submission asks for what is still open to be shown at once.
  const [check] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('check'),
  );
  const started = questionnaire.template !== null;
  const hasOwn = questionnaire.items.length > 0 || questionnaire.access.addItems;
  return (
    <div className="flex flex-col gap-6">
      {started ? null : (
        <Start projectId={projectId} questionnaire={questionnaire} onStarted={setQuestionnaire} />
      )}
      {started || hasOwn ? (
        // One form before and after the start, so that what was typed into it stays.
        <QuestionnaireForm
          projectId={projectId}
          questionnaire={questionnaire}
          onQuestionnaire={setQuestionnaire}
          checkOnOpen={check}
        />
      ) : null}
    </div>
  );
}

/** The questionnaire of a project for its applicant (ST-35.05). */
export default function ProjectQuestionnairePage() {
  const { id } = useParams<{ id: string }>();
  const { state, reload } = useApi<ProjectQuestionnaire>(
    `/feasibility-projects/${encodeURIComponent(id)}/questionnaire`,
  );
  return (
    <>
      <PageTitle
        title="پرسشنامه پروژه"
        action={
          <Link href={`/dashboard/feasibility/${id}`} className="text-sm no-underline">
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
