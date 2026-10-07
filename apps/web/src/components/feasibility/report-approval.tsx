'use client';

import {
  Button,
  cn,
  ErrorMessage,
  FieldShell,
  formatDateTimeFa,
  SuccessMessage,
  TextArea,
} from '@roshd/ui';
import {
  FEASIBILITY_NOTE_MAX,
  REPORT_APPROVAL_STATE_LABELS_FA,
  REPORT_APPROVAL_STEP_LABELS_FA,
  type ReportApprovalState,
  type ReportApprovalStep,
} from '@roshd/validation';
import { type FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ReportApproval, ReportDocument } from './report-types';

const STATE_TONE: Record<ReportApprovalState, string> = {
  pending: 'bg-notice-bg text-notice-fg',
  pending_officer: 'bg-notice-bg text-notice-fg',
  pending_admin: 'bg-notice-bg text-notice-fg',
  approved: 'bg-success-bg text-success-fg',
  rejected: 'bg-surface-2 text-ink-4',
};

/** Where the approval of a version stands, as a badge. */
export function ApprovalBadge({ state }: { state: ReportApprovalState }) {
  return (
    <span
      className={cn('inline-block rounded-chip px-2 py-[3px] text-xs font-bold', STATE_TONE[state])}
    >
      {REPORT_APPROVAL_STATE_LABELS_FA[state]}
    </span>
  );
}

const APPROVE_LABELS_FA: Record<ReportApprovalStep, string> = {
  officer: 'تأیید این نسخه (مسئول امکان‌سنجی)',
  admin: 'تأیید نهایی این نسخه (مدیر)',
};

const PENDING_HINT_FA: Partial<Record<ReportApprovalState, string>> = {
  pending:
    'این نسخه هنوز تأیید نهایی نشده است. گزارش نهایی پس از تأیید مسئول امکان‌سنجی و مدیر تحویل می‌شود.',
  pending_officer:
    'این نسخه منتظر تأیید مسئول امکان‌سنجی است؛ تأیید نهایی مدیر پس از آن ثبت می‌شود.',
  pending_admin: 'مسئول امکان‌سنجی این نسخه را تأیید کرده است و تأیید نهایی با مدیر دیگری است.',
  approved: 'این نسخه هر دو تأیید را دارد و می‌تواند به متقاضی تحویل شود.',
  rejected: 'این نسخه رد شده است. پس از اصلاح پیش‌نویس، نسخه تازه‌ای صادر کنید.',
};

/**
 * The two approvals of a version of a report (ST-35.14): first the feasibility officer, then an
 * admin. Everybody who reads the version sees where it stands; the names and times of the
 * approvals stand on the approved report. Staff who may decide now get the buttons: to approve,
 * or to refuse the version with a note that says what has to be corrected.
 */
export function ReportApprovalPanel({
  path,
  report,
  side,
  onChanged,
}: {
  /** The API path of the version, without its query. */
  path: string;
  report: ReportDocument & { approval: ReportApproval };
  side: 'applicant' | 'staff';
  onChanged: () => void;
}) {
  const { approval } = report;
  const step: ReportApprovalStep | null = report.access?.officer
    ? 'officer'
    : report.access?.admin
      ? 'admin'
      : null;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approved' | 'rejected' | null>(null);
  const [noteError, setNoteError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!step) return;
    setError(null);
    setDone(null);
    setNoteError(undefined);
    if (decision === 'rejected' && !note.trim()) {
      setNoteError('دلیل رد این نسخه را بنویسید تا پیش‌نویس اصلاح شود.');
      document.getElementById('approval-note')?.focus();
      return;
    }
    if (
      decision === 'rejected' &&
      !window.confirm(
        'این نسخه رد شود؟ نسخه ردشده دیگر تأیید نمی‌شود و باید نسخه تازه‌ای صادر شود.',
      )
    ) {
      return;
    }
    setBusy(decision);
    const result = await apiFetch(`${path}/approvals`, {
      method: 'POST',
      body: { step, decision, note: note.trim() || undefined },
    });
    setBusy(null);
    if (result.ok) {
      setNote('');
      setDone(decision === 'approved' ? 'تأیید شما ثبت شد.' : 'این نسخه رد شد.');
      onChanged();
      return;
    }
    const refusedNote = result.details.find((detail) => detail.path === 'note')?.message;
    setNoteError(refusedNote);
    setError(result.message);
    if (refusedNote) document.getElementById('approval-note')?.focus();
    // Also after a refusal: somebody else may have decided a moment earlier.
    else onChanged();
  };

  return (
    <section
      aria-labelledby="report-approval"
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="report-approval" className="text-base font-extrabold text-brand-900">
          تأیید گزارش
        </h2>
        <ApprovalBadge state={approval.state} />
      </div>
      {approval.steps.length > 0 ? (
        <ul className="flex flex-col gap-2 text-[15px]" aria-label="تصمیم‌های ثبت‌شده">
          {approval.steps.map((item) => (
            <li key={item.step}>
              <span className="font-bold">
                {item.decision === 'approved' ? 'تأیید' : 'رد'}{' '}
                {REPORT_APPROVAL_STEP_LABELS_FA[item.step]}:
              </span>{' '}
              {item.by || 'کاربر حذف‌شده'}،{' '}
              <time dateTime={item.at}>{formatDateTimeFa(item.at)}</time>
              {item.note ? (
                <p className="mt-1 leading-relaxed whitespace-pre-line text-ink-3">{item.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {side === 'applicant' && approval.state === 'approved' ? null : (
        <p className="text-[15px] leading-relaxed text-ink-3">{PENDING_HINT_FA[approval.state]}</p>
      )}
      {done ? <SuccessMessage>{done}</SuccessMessage> : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {step ? (
        <form
          method="post"
          onSubmit={(event: FormEvent) => event.preventDefault()}
          className="flex flex-col gap-3"
        >
          <FieldShell
            id="approval-note"
            label="یادداشت (برای رد لازم است)"
            hint="این یادداشت را کارکنان و کارشناسان پروژه می‌خوانند؛ متقاضی آن را نمی‌بیند."
            error={noteError}
          >
            <TextArea
              id="approval-note"
              rows={3}
              hasHint
              value={note}
              maxLength={FEASIBILITY_NOTE_MAX}
              error={noteError}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteError(undefined);
              }}
            />
          </FieldShell>
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy !== null} onClick={() => void decide('approved')}>
              {busy === 'approved' ? 'در حال ثبت…' : APPROVE_LABELS_FA[step]}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void decide('rejected')}
            >
              {busy === 'rejected' ? 'در حال ثبت…' : 'رد این نسخه'}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
