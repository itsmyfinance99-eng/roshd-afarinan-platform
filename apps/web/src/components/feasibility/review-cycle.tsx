'use client';

import {
  Button,
  cn,
  ErrorMessage,
  FieldShell,
  formatDateTimeFa,
  Select,
  Skeleton,
  SuccessMessage,
  TextArea,
} from '@roshd/ui';
import {
  createReviewReplySchema,
  createReviewThreadSchema,
  FEASIBILITY_ACTOR_LABELS_FA,
  FEASIBILITY_NOTE_MAX,
  FEASIBILITY_REVIEW_COMMENT_MAX,
  FEASIBILITY_REVIEW_SECTION_LABELS_FA,
  FEASIBILITY_REVIEW_SECTIONS,
  type FeasibilityActor,
  type FeasibilityReviewSection,
  type FeasibilityStatus,
} from '@roshd/validation';
import { type FormEvent, useState } from 'react';
import type { StaffRef } from '@/components/dashboard/types';
import { Pagination } from '@/components/dashboard/ui';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { FeasibilityProjectDetail } from './types';

/** Whose page the review is shown on: the applicant's, or that of the staff and the experts. */
type Side = 'applicant' | 'staff';

interface Step {
  to: FeasibilityStatus;
  label: string;
  busy: string;
  done: string;
  confirm?: string;
}

/** The steps of the review cycle the caller may take now, in the order they are offered. */
function stepsOf(project: FeasibilityProjectDetail, side: Side): Step[] {
  const open = (to: FeasibilityStatus) => project.access.transitions.includes(to);
  const inReview = project.status === 'EXPERT_REVIEW' || project.status === 'CLIENT_REVIEW';
  return [
    ...(project.status === 'IN_PROGRESS' && open('EXPERT_REVIEW')
      ? [
          {
            to: 'EXPERT_REVIEW' as const,
            label: 'ارسال برای بازبینی کارشناس',
            busy: 'در حال ارسال…',
            done: 'مطالعه برای بازبینی کارشناس فرستاده شد.',
          },
        ]
      : []),
    ...(project.status === 'EXPERT_REVIEW' && open('CLIENT_REVIEW')
      ? [
          {
            to: 'CLIENT_REVIEW' as const,
            label: 'ارسال برای بازبینی متقاضی',
            busy: 'در حال ارسال…',
            done: 'مطالعه برای بازبینی متقاضی فرستاده شد.',
            confirm: 'مطالعه برای بازبینی متقاضی فرستاده شود؟',
          },
        ]
      : []),
    // The same status is reached out of the contract step by confirming the contract.
    ...(inReview && open('IN_PROGRESS')
      ? [
          {
            to: 'IN_PROGRESS' as const,
            label: side === 'applicant' ? 'درخواست اصلاح مطالعه' : 'برگرداندن به انجام کار',
            busy: 'در حال ثبت…',
            done:
              side === 'applicant'
                ? 'مطالعه برای اصلاح برگردانده شد.'
                : 'مطالعه به مرحله انجام برگشت.',
          },
        ]
      : []),
  ];
}

/**
 * The steps of the review cycle of a study (ST-35.11): to the review of the experts, on to the
 * review of the applicant, and back to the work. Only the steps the API offers the caller are
 * shown. The delivery of the study is not a step of this cycle.
 */
export function ReviewSteps({
  project,
  side,
  onChanged,
}: {
  project: FeasibilityProjectDetail;
  side: Side;
  onChanged: () => void;
}) {
  const steps = stepsOf(project, side);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<FeasibilityStatus | null>(null);
  const [noteError, setNoteError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<Step | null>(null);
  // The message of a step is said while the project is where that step took it.
  const done = taken && project.status === taken.to ? taken.done : null;

  if (steps.length === 0) {
    // A refusal is still said when the project it left behind offers no step any more.
    if (error) return <ErrorMessage>{error}</ErrorMessage>;
    return done ? <SuccessMessage>{done}</SuccessMessage> : null;
  }

  const take = async (step: Step) => {
    setError(null);
    setTaken(null);
    if (step.confirm && !window.confirm(step.confirm)) return;
    setNoteError(undefined);
    setBusy(step.to);
    const result = await apiFetch(`/feasibility-projects/${project.id}/transitions`, {
      method: 'POST',
      body: { to: step.to, note: note.trim() || undefined },
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
    if (refusedNote) document.getElementById('cycle-note')?.focus();
    // Also after a refusal: somebody else may have taken the step a moment earlier.
    else onChanged();
  };

  return (
    <form
      method="post"
      onSubmit={(event: FormEvent) => event.preventDefault()}
      aria-labelledby="cycle-title"
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <h2 id="cycle-title" className="text-base font-extrabold text-brand-900">
        {side === 'applicant' ? 'بازبینی مطالعه' : 'چرخه بازبینی'}
      </h2>
      <FieldShell
        id="cycle-note"
        label="یادداشت این گام (اختیاری)"
        hint={
          side === 'applicant'
            ? 'کارشناسان این یادداشت را می‌خوانند. جزئیات را در «نظرهای بازبینی» روی هر بخش بنویسید.'
            : 'متقاضی، کارشناسان و کارکنان پروژه این یادداشت را در روند پروژه و در اعلان می‌خوانند.'
        }
        error={noteError}
      >
        <TextArea
          id="cycle-note"
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
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {done ? <SuccessMessage>{done}</SuccessMessage> : null}
      <div className="flex flex-wrap gap-3">
        {steps.map((step) => (
          <Button
            key={step.to}
            variant={step.to === 'IN_PROGRESS' ? 'outline' : 'primary'}
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

interface ReviewComment {
  id: string;
  body: string;
  createdAt: string;
  authorAs: FeasibilityActor;
  mine: boolean;
  /** Staff and experts only. */
  by?: StaffRef | null;
}

/** Mirrors the items of GET /api/v1/feasibility-projects/:id/review-threads. */
interface ReviewThread {
  id: string;
  section: string;
  shared: boolean;
  createdAt: string;
  handledAt: string | null;
  /** Staff and experts only. */
  handledBy?: StaffRef | null;
  comments: ReviewComment[];
  access: { reply: boolean; handle: boolean; reopen: boolean };
}

const PAGE_SIZE = 10;
const ALL = '';

const sectionLabel = (section: string): string =>
  FEASIBILITY_REVIEW_SECTION_LABELS_FA[section as FeasibilityReviewSection] ?? section;

const tag = 'inline-block rounded-chip px-2 py-[3px] text-xs font-bold';

/** Whether the review of this project has anything to show: the work on it started once. */
export const hasReview = (project: FeasibilityProjectDetail): boolean =>
  project.events.some((event) => event.toStatus === 'IN_PROGRESS');

/**
 * The comments of the review of a study (ST-35.11): threads on the parts of the study, each
 * with its answers and a handled state. The applicant reads the threads shared with them; the
 * staff and the experts read every thread and say which ones the applicant reads.
 */
export function ReviewThreads({
  project,
  side,
  initialSection = ALL,
}: {
  project: FeasibilityProjectDetail;
  side: Side;
  /** The part the list opens on: the chapter of the report the reader came from (ST-35.12). */
  initialSection?: string;
}) {
  const [page, setPage] = useState(1);
  const [section, setSection] = useState(initialSection);
  const [only, setOnly] = useState(ALL);
  const { state, reload } = useApi<ReviewThread[]>(
    `/feasibility-projects/${project.id}/review-threads?page=${page}&pageSize=${PAGE_SIZE}` +
      (section ? `&section=${section}` : '') +
      (only ? `&state=${only}` : ''),
  );
  const filtered = section !== ALL || only !== ALL;

  return (
    <section aria-labelledby="threads-title" className="flex flex-col gap-4">
      <h2 id="threads-title" className="text-base font-extrabold text-brand-900">
        نظرهای بازبینی
      </h2>
      <p className="text-[13px] leading-relaxed text-ink-5">
        {side === 'applicant'
          ? project.access.comment
            ? 'نظر خود را روی هر بخش مطالعه بنویسید. کارشناسان پاسخ می‌دهند و پس از رسیدگی، وضعیت نظر را ثبت می‌کنند.'
            : 'نظرهای بازبینی این مطالعه و پاسخ‌های آن‌ها را اینجا می‌خوانید. نظر تازه را هنگامی می‌نویسید که مطالعه برای بازبینی نزد شما است.'
          : 'هر نظر روی یک بخش مطالعه نوشته می‌شود. نظر متقاضی را همه می‌بینند؛ نظر شما داخلی است مگر آن را با متقاضی در میان بگذارید.'}
      </p>
      {project.access.comment ? (
        <NewThread
          projectId={project.id}
          side={side}
          onAdded={() => {
            // The new thread is the first of the first page.
            if (page === 1) reload({ silent: true });
            else setPage(1);
          }}
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldShell id="threads-section" label="بخش">
          <Select
            id="threads-section"
            value={section}
            onChange={(event) => {
              setSection(event.target.value);
              setPage(1);
            }}
          >
            <option value={ALL}>همه بخش‌ها</option>
            {FEASIBILITY_REVIEW_SECTIONS.map((key) => (
              <option key={key} value={key}>
                {FEASIBILITY_REVIEW_SECTION_LABELS_FA[key]}
              </option>
            ))}
          </Select>
        </FieldShell>
        <FieldShell id="threads-state" label="وضعیت رسیدگی">
          <Select
            id="threads-state"
            value={only}
            onChange={(event) => {
              setOnly(event.target.value);
              setPage(1);
            }}
          >
            <option value={ALL}>همه نظرها</option>
            <option value="open">باز</option>
            <option value="handled">رسیدگی‌شده</option>
          </Select>
        </FieldShell>
      </div>
      {state.status === 'loading' ? (
        <div aria-busy="true" aria-label="در حال بارگذاری نظرها" className="flex flex-col gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : state.status === 'error' ? (
        <div className="flex flex-col items-start gap-2">
          <ErrorMessage>{state.message}</ErrorMessage>
          <Button variant="outline" size="sm" onClick={() => reload()}>
            تلاش دوباره
          </Button>
        </div>
      ) : state.data.length === 0 && page > 1 ? (
        // The page lost its last thread (handled under the filter «باز», for one).
        <div className="flex flex-col items-start gap-2">
          <p className="text-[15px] text-ink-5">در این صفحه نظری نمانده است.</p>
          <Button variant="outline" size="sm" onClick={() => setPage(1)}>
            بازگشت به صفحه نخست
          </Button>
        </div>
      ) : state.data.length === 0 ? (
        <p className="text-[15px] text-ink-5">
          {filtered
            ? 'نظری با این بخش و وضعیت پیدا نشد.'
            : 'هنوز نظری در بازبینی این مطالعه نوشته نشده است.'}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {state.data.map((thread) => (
              <li key={thread.id}>
                <ThreadCard
                  projectId={project.id}
                  thread={thread}
                  side={side}
                  onChanged={() => reload({ silent: true })}
                />
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

function NewThread({
  projectId,
  side,
  onAdded,
}: {
  projectId: string;
  side: Side;
  onAdded: () => void;
}) {
  const [section, setSection] = useState<string>(FEASIBILITY_REVIEW_SECTIONS[0]);
  const [body, setBody] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const parsed = createReviewThreadSchema.safeParse({
      section,
      body,
      ...(side === 'staff' ? { shared } : {}),
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'نظر را بنویسید.');
      document.getElementById('thread-body')?.focus();
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    const result = await apiFetch(`/feasibility-projects/${projectId}/review-threads`, {
      method: 'POST',
      body: parsed.data,
    });
    setBusy(false);
    if (result.ok) {
      setBody('');
      setShared(false);
      setSaved(true);
      onAdded();
      return;
    }
    const refused = result.details.find((detail) => detail.path === 'body')?.message;
    setFieldError(refused);
    setError(result.message);
    if (refused) document.getElementById('thread-body')?.focus();
  };

  return (
    <form
      method="post"
      onSubmit={(event) => void submit(event)}
      aria-labelledby="thread-new-title"
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <h3 id="thread-new-title" className="text-[15px] font-extrabold text-brand-900">
        نظر تازه
      </h3>
      <FieldShell id="thread-section" label="بخش مطالعه">
        <Select
          id="thread-section"
          value={section}
          onChange={(event) => {
            setSection(event.target.value);
            setSaved(false);
          }}
        >
          {FEASIBILITY_REVIEW_SECTIONS.map((key) => (
            <option key={key} value={key}>
              {FEASIBILITY_REVIEW_SECTION_LABELS_FA[key]}
            </option>
          ))}
        </Select>
      </FieldShell>
      <FieldShell id="thread-body" label="متن نظر" error={fieldError}>
        <TextArea
          id="thread-body"
          rows={3}
          value={body}
          maxLength={FEASIBILITY_REVIEW_COMMENT_MAX}
          error={fieldError}
          onChange={(event) => {
            setBody(event.target.value);
            setFieldError(undefined);
            setSaved(false);
          }}
        />
      </FieldShell>
      {side === 'staff' ? (
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={shared}
            onChange={(event) => setShared(event.target.checked)}
            className="size-[18px] accent-primary"
          />
          متقاضی هم این نظر و پاسخ‌هایش را ببیند
        </label>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {saved ? <SuccessMessage>نظر ثبت شد.</SuccessMessage> : null}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'در حال ثبت…' : 'ثبت نظر'}
        </Button>
      </div>
    </form>
  );
}

function ThreadCard({
  projectId,
  thread,
  side,
  onChanged,
}: {
  projectId: string;
  thread: ReviewThread;
  side: Side;
  onChanged: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<'reply' | 'state' | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const titleId = `thread-${thread.id}`;
  const replyId = `reply-${thread.id}`;
  const base = `/feasibility-projects/${projectId}/review-threads/${thread.id}`;
  const handled = thread.handledAt !== null;
  const label = sectionLabel(thread.section);

  const reply = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = createReviewReplySchema.safeParse({ body });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'پاسخ را بنویسید.');
      document.getElementById(replyId)?.focus();
      return;
    }
    setFieldError(undefined);
    setBusy('reply');
    const result = await apiFetch(`${base}/comments`, { method: 'POST', body: parsed.data });
    setBusy(null);
    if (result.ok) {
      setBody('');
      onChanged();
      return;
    }
    const refused = result.details.find((detail) => detail.path === 'body')?.message;
    setFieldError(refused);
    setError(result.message);
    if (refused) document.getElementById(replyId)?.focus();
    // The thread may have been closed with its project meanwhile.
    else onChanged();
  };

  const setHandled = async (value: boolean) => {
    setError(null);
    setBusy('state');
    const result = await apiFetch(`${base}/handled`, { method: 'PUT', body: { handled: value } });
    setBusy(null);
    if (!result.ok) setError(result.message);
    onChanged();
  };

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={titleId} className="text-[15px] font-extrabold text-brand-900">
          {label}
        </h3>
        <span
          className={cn(
            tag,
            handled ? 'bg-success-bg text-success-fg' : 'bg-notice-bg text-notice-fg',
          )}
        >
          {handled ? 'رسیدگی‌شده' : 'باز'}
        </span>
        {side === 'staff' ? (
          <span className={cn(tag, 'bg-surface-2 text-ink-4')}>
            {thread.shared ? 'مشترک با متقاضی' : 'داخلی'}
          </span>
        ) : null}
      </div>
      <ol className="flex flex-col gap-3">
        {thread.comments.map((comment) => (
          <li key={comment.id} className="border-s-2 border-line ps-3">
            <p className="text-[13px] text-ink-5">
              {side === 'applicant'
                ? comment.mine
                  ? 'شما'
                  : FEASIBILITY_ACTOR_LABELS_FA[comment.authorAs]
                : `${FEASIBILITY_ACTOR_LABELS_FA[comment.authorAs]} · ${
                    comment.by?.fullName ?? 'کاربر حذف‌شده'
                  }`}
              {' · '}
              <time dateTime={comment.createdAt}>{formatDateTimeFa(comment.createdAt)}</time>
            </p>
            <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{comment.body}</p>
          </li>
        ))}
      </ol>
      {thread.handledAt && side === 'staff' ? (
        <p className="text-[13px] text-ink-5">
          رسیدگی: {thread.handledBy?.fullName ?? 'کاربر حذف‌شده'} ·{' '}
          <time dateTime={thread.handledAt}>{formatDateTimeFa(thread.handledAt)}</time>
        </p>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {thread.access.reply ? (
        <form method="post" onSubmit={(event) => void reply(event)} className="flex flex-col gap-3">
          <FieldShell id={replyId} label={`پاسخ به نظر «${label}»`} error={fieldError}>
            <TextArea
              id={replyId}
              rows={2}
              value={body}
              maxLength={FEASIBILITY_REVIEW_COMMENT_MAX}
              error={fieldError}
              onChange={(event) => {
                setBody(event.target.value);
                setFieldError(undefined);
              }}
            />
          </FieldShell>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="sm" disabled={busy !== null}>
              {busy === 'reply' ? 'در حال ثبت…' : 'ثبت پاسخ'}
            </Button>
            <StateButton thread={thread} busy={busy} onSet={(value) => void setHandled(value)} />
          </div>
        </form>
      ) : null}
    </article>
  );
}

/** Marks the thread handled or opens it again, whichever the caller may do now. */
function StateButton({
  thread,
  busy,
  onSet,
}: {
  thread: ReviewThread;
  busy: 'reply' | 'state' | null;
  onSet: (handled: boolean) => void;
}) {
  if (!thread.access.handle && !thread.access.reopen) return null;
  const handle = thread.access.handle;
  return (
    <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => onSet(handle)}>
      {busy === 'state' ? 'در حال ثبت…' : handle ? 'رسیدگی شد' : 'باز کردن دوباره'}
    </Button>
  );
}
