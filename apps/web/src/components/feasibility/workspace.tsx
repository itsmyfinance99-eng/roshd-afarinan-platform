'use client';

import {
  Button,
  ErrorMessage,
  FieldShell,
  formatDateTimeFa,
  Skeleton,
  SuccessMessage,
  TextArea,
} from '@roshd/ui';
import {
  createInternalNoteSchema,
  FEASIBILITY_INTERNAL_NOTE_MAX,
  FEASIBILITY_WORK_STATUSES,
  type FeasibilityStatus,
} from '@roshd/validation';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import type { StaffRef } from '@/components/dashboard/types';
import { Pagination } from '@/components/dashboard/ui';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { FeasibilityProjectDetail } from './types';

/**
 * The financial model of a study (ST-35.10) as the staff and the assigned experts of the project
 * reach it: made here once the work has started, and filled in and calculated in the editor of
 * the financial models. The applicant has no such section.
 */
export function ProjectModel({
  project,
  onChanged,
}: {
  project: FeasibilityProjectDetail;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState(false);
  const model = project.financialModel;
  const started = (FEASIBILITY_WORK_STATUSES as readonly FeasibilityStatus[]).includes(
    project.status,
  );

  const create = async () => {
    setError(null);
    setBusy(true);
    const result = await apiFetch(`/feasibility-projects/${project.id}/financial-model`, {
      method: 'POST',
    });
    setBusy(false);
    if (result.ok) setMade(true);
    else setError(result.message);
    // Also after a refusal: a colleague may have made the model a moment earlier.
    onChanged();
  };

  return (
    <section
      aria-labelledby="model-title"
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <h2 id="model-title" className="text-base font-extrabold text-brand-900">
        مدل مالی مطالعه
      </h2>
      {model ? (
        <>
          <p className="text-[15px] leading-relaxed text-ink-5">
            ورودی‌های مدل را کارشناسان پروژه وارد و محاسبه می‌کنند. اجرای محاسبه را فردی جز
            محاسبه‌کننده آن تأیید می‌کند.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
            <li>
              <Link href={`/dashboard/models/${model.id}`} className="font-bold">
                ورودی‌های مدل مالی ‹
              </Link>
            </li>
            <li>
              <Link href={`/dashboard/models/${model.id}/runs`} className="font-bold">
                اجراهای محاسبه ‹
              </Link>
            </li>
          </ul>
        </>
      ) : project.access.createModel ? (
        <>
          <p className="text-[15px] leading-relaxed text-ink-5">
            این پروژه هنوز مدل مالی ندارد. مدل خالی ساخته می‌شود و کارشناسان پروژه آن را کامل
            می‌کنند؛ هر پروژه یک مدل مالی دارد.
          </p>
          <div>
            <Button disabled={busy} onClick={() => void create()}>
              {busy ? 'در حال ساخت…' : 'ساخت مدل مالی'}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-[15px] text-ink-5">
          {started || project.status === 'DELIVERED' || project.status === 'ARCHIVED'
            ? 'برای این پروژه مدل مالی ساخته نشده است.'
            : 'مدل مالی پس از تأیید قرارداد و شروع کار روی مطالعه ساخته می‌شود.'}
        </p>
      )}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {made && model ? <SuccessMessage>مدل مالی مطالعه ساخته شد.</SuccessMessage> : null}
    </section>
  );
}

interface InternalNote {
  id: string;
  body: string;
  createdAt: string;
  author: StaffRef | null;
}

const PAGE_SIZE = 20;

/**
 * The internal notes of a project (ST-35.10): what its staff and its assigned experts write for
 * each other. The applicant never reads them, and the page of the applicant does not ask for them.
 */
export function InternalNotes({ project }: { project: FeasibilityProjectDetail }) {
  const [page, setPage] = useState(1);
  const { state, reload } = useApi<InternalNote[]>(
    `/feasibility-projects/${project.id}/notes?page=${page}&pageSize=${PAGE_SIZE}`,
  );
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const parsed = createInternalNoteSchema.safeParse({ body });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'یادداشت را بنویسید.');
      document.getElementById('internal-note')?.focus();
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    const result = await apiFetch(`/feasibility-projects/${project.id}/notes`, {
      method: 'POST',
      body: parsed.data,
    });
    setBusy(false);
    if (result.ok) {
      setBody('');
      setSaved(true);
      // The new note is the first of the first page.
      if (page === 1) reload({ silent: true });
      else setPage(1);
      return;
    }
    const refused = result.details.find((detail) => detail.path === 'body')?.message;
    setFieldError(refused);
    setError(result.message);
    if (refused) document.getElementById('internal-note')?.focus();
  };

  return (
    <section aria-labelledby="notes-title" className="flex flex-col gap-3">
      <h2 id="notes-title" className="text-base font-extrabold text-brand-900">
        یادداشت‌های داخلی
      </h2>
      <p className="text-[13px] text-ink-5">
        این یادداشت‌ها را فقط کارکنان و کارشناسان این پروژه می‌بینند؛ متقاضی آن‌ها را نمی‌بیند.
      </p>
      {project.access.addNote ? (
        <form
          method="post"
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-3 rounded-card border border-line p-4"
        >
          <FieldShell id="internal-note" label="یادداشت تازه" error={fieldError}>
            <TextArea
              id="internal-note"
              rows={3}
              value={body}
              maxLength={FEASIBILITY_INTERNAL_NOTE_MAX}
              error={fieldError}
              onChange={(event) => {
                setBody(event.target.value);
                setFieldError(undefined);
                setSaved(false);
              }}
            />
          </FieldShell>
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          {saved ? <SuccessMessage>یادداشت ثبت شد.</SuccessMessage> : null}
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? 'در حال ثبت…' : 'ثبت یادداشت'}
            </Button>
          </div>
        </form>
      ) : null}
      {state.status === 'loading' ? (
        <div
          aria-busy="true"
          aria-label="در حال بارگذاری یادداشت‌ها"
          className="flex flex-col gap-2"
        >
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : state.status === 'error' ? (
        <div className="flex flex-col items-start gap-2">
          <ErrorMessage>{state.message}</ErrorMessage>
          <Button variant="outline" size="sm" onClick={() => reload()}>
            تلاش دوباره
          </Button>
        </div>
      ) : state.data.length === 0 ? (
        <p className="text-[15px] text-ink-5">هنوز یادداشتی برای این پروژه نوشته نشده است.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {state.data.map((note) => (
              <li key={note.id} className="rounded-card border border-line p-4">
                <p className="text-[13px] text-ink-5">
                  {note.author?.fullName ?? 'کاربر حذف‌شده'} · {formatDateTimeFa(note.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{note.body}</p>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={state.meta?.total ?? state.data.length}
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}
