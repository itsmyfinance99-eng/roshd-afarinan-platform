'use client';

import { Button, ErrorMessage, FieldShell, SuccessMessage, TextArea } from '@roshd/ui';
import {
  FEASIBILITY_NOTE_MAX,
  FEASIBILITY_REVIEW_QUEUE_STATUSES,
  FEASIBILITY_STAFF_NOTE_REQUIRED,
  type FeasibilityStatus,
} from '@roshd/validation';
import { type FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { FeasibilityProjectDetail } from './types';

/** The steps of the intake review, in the order they are offered, with what each one means. */
const STEPS: readonly { to: FeasibilityStatus; label: string; busy: string; done: string }[] = [
  {
    to: 'INITIAL_REVIEW',
    label: 'شروع بررسی اولیه',
    busy: 'در حال ثبت…',
    done: 'بررسی اولیه شروع شد.',
  },
  {
    to: 'NEEDS_MORE_INFO',
    label: 'درخواست اطلاعات تکمیلی',
    busy: 'در حال ثبت…',
    done: 'از متقاضی اطلاعات تکمیلی خواسته شد.',
  },
  { to: 'ARCHIVED', label: 'بایگانی پروژه', busy: 'در حال بایگانی…', done: 'پروژه بایگانی شد.' },
];

const needsNote = (to: FeasibilityStatus): boolean =>
  (FEASIBILITY_STAFF_NOTE_REQUIRED as readonly FeasibilityStatus[]).includes(to);

/**
 * The steps staff take in the intake review of a project (ST-35.07): start the review, ask the
 * applicant for more information, or archive the project. Only the steps the API offers the
 * caller are shown; asking for more and archiving go with a note the applicant reads.
 */
export function ReviewActions({
  project,
  onChanged,
}: {
  project: FeasibilityProjectDetail;
  onChanged: () => void;
}) {
  const steps = STEPS.filter((step) => project.access.transitions.includes(step.to));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<FeasibilityStatus | null>(null);
  const [noteError, setNoteError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<(typeof STEPS)[number] | null>(null);
  // The message of a step is said while the project is where that step took it.
  const done = taken && project.status === taken.to ? taken.done : null;

  if (steps.length === 0) return done ? <SuccessMessage>{done}</SuccessMessage> : null;

  // After the intake only archiving is left here, and a delivered study needs no reason.
  const intake = (FEASIBILITY_REVIEW_QUEUE_STATUSES as readonly FeasibilityStatus[]).includes(
    project.status,
  );
  const noteOptional = project.status === 'DELIVERED';

  const take = async (step: (typeof STEPS)[number]) => {
    setError(null);
    setTaken(null);
    const text = note.trim();
    // A delivered study is filed away without a reason; every other archive has one.
    if (needsNote(step.to) && !noteOptional && text === '') {
      setNoteError(
        step.to === 'NEEDS_MORE_INFO'
          ? 'بنویسید چه اطلاعات یا مدرکی لازم است.'
          : 'دلیل بایگانی را برای متقاضی بنویسید.',
      );
      document.getElementById('review-note')?.focus();
      return;
    }
    if (
      step.to === 'ARCHIVED' &&
      !window.confirm('پروژه بایگانی شود؟ پروژه بایگانی‌شده دیگر تغییر نمی‌کند.')
    ) {
      return;
    }
    setNoteError(undefined);
    setBusy(step.to);
    const result = await apiFetch(`/feasibility-projects/${project.id}/transitions`, {
      method: 'POST',
      body: { to: step.to, note: text || undefined },
    });
    setBusy(null);
    if (result.ok) {
      setNote('');
      setTaken(step);
      onChanged();
      return;
    }
    const refusedNote = result.details.find((detail) => detail.path === 'note')?.message;
    setNoteError(refusedNote);
    setError(result.message);
    if (refusedNote) document.getElementById('review-note')?.focus();
  };

  return (
    <form
      method="post"
      onSubmit={(event: FormEvent) => event.preventDefault()}
      aria-labelledby="review-title"
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <h2 id="review-title" className="text-base font-extrabold text-brand-900">
        {intake ? 'بررسی اولیه' : 'بایگانی پروژه'}
      </h2>
      <FieldShell
        id="review-note"
        label="یادداشت برای متقاضی"
        hint={
          noteOptional
            ? 'متقاضی این یادداشت را در روند پروژه و در اعلان می‌خواند. نوشتن آن اختیاری است.'
            : intake
              ? 'متقاضی این یادداشت را در روند پروژه و در اعلان می‌خواند. برای درخواست اطلاعات تکمیلی و بایگانی لازم است.'
              : 'متقاضی این یادداشت را در روند پروژه و در اعلان می‌خواند. برای بایگانی لازم است.'
        }
        error={noteError}
      >
        <TextArea
          id="review-note"
          rows={3}
          hasHint
          value={note}
          maxLength={FEASIBILITY_NOTE_MAX}
          error={noteError}
          onChange={(e) => {
            setNote(e.target.value);
            setNoteError(undefined);
          }}
        />
      </FieldShell>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {done ? <SuccessMessage>{done}</SuccessMessage> : null}
      <div className="flex flex-wrap gap-3">
        {steps.map((step) => (
          <Button
            key={step.to}
            variant={
              step.to === 'ARCHIVED'
                ? 'ghost'
                : step.to === 'INITIAL_REVIEW'
                  ? 'primary'
                  : 'outline'
            }
            disabled={busy !== null}
            onClick={() => void take(step)}
          >
            {busy === step.to ? step.busy : step.label}
          </Button>
        ))}
      </div>
    </form>
  );
}
