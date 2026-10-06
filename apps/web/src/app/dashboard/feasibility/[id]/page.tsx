'use client';

import { Button, ErrorMessage, FieldShell, Notice, SuccessMessage, TextArea } from '@roshd/ui';
import { FEASIBILITY_NOTE_MAX, type FeasibilityStatus } from '@roshd/validation';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import {
  ProjectAttachments,
  ProjectFacts,
  ProjectForm,
  ProjectTimeline,
} from '@/components/feasibility/parts';
import type { FeasibilityProjectDetail } from '@/components/feasibility/types';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

/** What the applicant should know or do in a status; the other statuses speak for themselves. */
const GUIDANCE: Partial<Record<FeasibilityStatus, string>> = {
  DRAFT: 'این پروژه هنوز پیش‌نویس است. مشخصات را کامل کنید و برای بررسی بفرستید.',
  SUBMITTED: 'پروژه ارسال شده و در انتظار بررسی اولیه است.',
  INITIAL_REVIEW: 'پروژه در بررسی اولیه است. نتیجه از همین صفحه و با اعلان به شما خبر داده می‌شود.',
  NEEDS_MORE_INFO:
    'برای ادامه بررسی به اطلاعات بیشتری نیاز است. یادداشت بررسی را در روند پروژه بخوانید، مشخصات را کامل کنید و دوباره بفرستید.',
};

export default function MyFeasibilityProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { state, reload } = useApi<FeasibilityProjectDetail>(
    `/feasibility-projects/${encodeURIComponent(id)}`,
  );

  return (
    <>
      <PageTitle
        title="پروژه امکان‌سنجی"
        action={
          <Link href="/dashboard/feasibility" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(project) => <ProjectView project={project} onChanged={() => reload({ silent: true })} />}
      </AsyncBoundary>
    </>
  );
}

function ProjectView({
  project,
  onChanged,
}: {
  project: FeasibilityProjectDetail;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const guidance = GUIDANCE[project.status];
  const canSubmit = project.access.transitions.includes('SUBMITTED');

  const remove = async () => {
    if (!window.confirm(`پیش‌نویس «${project.title}» حذف شود؟ این کار برگشت ندارد.`)) return;
    setRemoving(true);
    setMessage(null);
    const result = await apiFetch(`/feasibility-projects/${project.id}`, { method: 'DELETE' });
    if (result.ok) {
      router.replace('/dashboard/feasibility');
      return;
    }
    setRemoving(false);
    setMessage({ ok: false, text: result.message });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-6">
        {guidance ? <Notice>{guidance}</Notice> : null}
        {editing ? (
          <section aria-labelledby="edit-title" className="flex flex-col gap-4">
            <h2 id="edit-title" className="text-base font-extrabold text-brand-900">
              ویرایش مشخصات
            </h2>
            <ProjectForm
              initial={{
                title: project.title,
                sector: project.sector ?? '',
                location: project.location ?? '',
                summary: project.summary ?? '',
              }}
              submitLabel="ذخیره تغییرات"
              busyLabel="در حال ذخیره…"
              onCancel={() => setEditing(false)}
              onSubmit={async (values) => {
                const result = await apiFetch(`/feasibility-projects/${project.id}`, {
                  method: 'PATCH',
                  body: {
                    title: values.title,
                    sector: values.sector ?? null,
                    location: values.location ?? null,
                    summary: values.summary,
                  },
                });
                if (!result.ok) return result;
                setEditing(false);
                setMessage({ ok: true, text: 'مشخصات پروژه ذخیره شد.' });
                onChanged();
                return { ok: true };
              }}
            />
          </section>
        ) : (
          <>
            <ProjectFacts project={project} />
            {project.sourceRequest ? (
              <p className="text-[15px]">
                <span className="text-ink-5">ساخته‌شده از درخواست </span>
                <Link href={`/dashboard/requests/${project.sourceRequest.id}`} dir="ltr">
                  {project.sourceRequest.trackingCode}
                </Link>
              </p>
            ) : null}
            <ProjectAttachments project={project} />
            {message ? (
              message.ok ? (
                <SuccessMessage>{message.text}</SuccessMessage>
              ) : (
                <ErrorMessage>{message.text}</ErrorMessage>
              )
            ) : null}
            {project.access.edit || project.access.remove ? (
              <div className="flex flex-wrap gap-3">
                {project.access.edit ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMessage(null);
                      setEditing(true);
                    }}
                  >
                    ویرایش مشخصات
                  </Button>
                ) : null}
                {project.access.remove ? (
                  <Button variant="ghost" disabled={removing} onClick={() => void remove()}>
                    {removing ? 'در حال حذف…' : 'حذف پیش‌نویس'}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {canSubmit ? (
              <SubmitForReview
                project={project}
                onDone={() => {
                  setMessage({ ok: true, text: 'پروژه برای بررسی ارسال شد.' });
                  onChanged();
                }}
              />
            ) : null}
          </>
        )}
      </div>
      <section aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="mb-4 text-base font-extrabold text-brand-900">
          روند پروژه
        </h2>
        <ProjectTimeline events={project.events} />
      </section>
    </div>
  );
}

function SubmitForReview({
  project,
  onDone,
}: {
  project: FeasibilityProjectDetail;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const again = project.status !== 'DRAFT';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors([]);
    const result = await apiFetch(`/feasibility-projects/${project.id}/transitions`, {
      method: 'POST',
      body: { to: 'SUBMITTED', note: note.trim() || undefined },
    });
    setBusy(false);
    if (result.ok) {
      onDone();
      return;
    }
    setErrors(result.details.length ? result.details.map((d) => d.message) : [result.message]);
  };

  return (
    <form
      method="post"
      onSubmit={(e) => void submit(e)}
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <h2 className="text-base font-extrabold text-brand-900">
        {again ? 'ارسال دوباره برای بررسی' : 'ارسال برای بررسی'}
      </h2>
      <p className="text-sm leading-relaxed text-ink-3">
        پس از ارسال، مشخصات پروژه تا پایان بررسی تغییر نمی‌کند.
      </p>
      <FieldShell id="submit-note" label="پیام برای بررسی‌کنندگان (اختیاری)">
        <TextArea
          id="submit-note"
          rows={3}
          value={note}
          maxLength={FEASIBILITY_NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
        />
      </FieldShell>
      {errors.length > 0 ? (
        <ErrorMessage>
          {errors.length === 1 ? (
            errors[0]
          ) : (
            <ul className="list-disc ps-5">
              {errors.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          )}
        </ErrorMessage>
      ) : null}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'در حال ارسال…' : again ? 'ارسال دوباره' : 'ارسال برای بررسی'}
        </Button>
      </div>
    </form>
  );
}
