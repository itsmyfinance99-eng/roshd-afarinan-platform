'use client';

import {
  Button,
  cn,
  EmptyState,
  ErrorMessage,
  FieldShell,
  formatDateFa,
  formatDateTimeFa,
  Select,
  TextArea,
  TextInput,
} from '@roshd/ui';
import {
  createFeasibilityProjectSchema,
  FEASIBILITY_ACTOR_LABELS_FA,
  FEASIBILITY_SECTORS,
  FEASIBILITY_STATUS_LABELS_FA,
  type FeasibilityStatus,
} from '@roshd/validation';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useState } from 'react';
import type { ApiErrorDetail } from '@roshd/types';
import { FileList } from '@/components/files/files';
import { daysFa, stageDays } from './stage-age';
import type {
  FeasibilityProjectDetail,
  FeasibilityProjectItem,
  FeasibilityStatusEvent,
} from './types';

const STATUS_TONE: Record<FeasibilityStatus, string> = {
  DRAFT: 'bg-surface-2 text-ink-4',
  SUBMITTED: 'bg-paper-3 text-copper-deep',
  INITIAL_REVIEW: 'bg-notice-bg text-notice-fg',
  NEEDS_MORE_INFO: 'bg-notice-bg text-notice-fg',
  COST_ESTIMATED: 'bg-paper-3 text-copper-deep',
  CONTRACT_PENDING: 'bg-paper-3 text-copper-deep',
  IN_PROGRESS: 'bg-notice-bg text-notice-fg',
  EXPERT_REVIEW: 'bg-notice-bg text-notice-fg',
  CLIENT_REVIEW: 'bg-notice-bg text-notice-fg',
  DELIVERED: 'bg-success-bg text-success-fg',
  ARCHIVED: 'bg-surface-2 text-ink-4',
};

export function FeasibilityStatusBadge({ status }: { status: FeasibilityStatus }) {
  return (
    <span
      className={cn(
        'inline-block rounded-chip px-2 py-[3px] text-xs font-bold',
        STATUS_TONE[status],
      )}
    >
      {FEASIBILITY_STATUS_LABELS_FA[status]}
    </span>
  );
}

export function ProjectList({
  items,
  hrefBase,
  empty,
  stageAsOf,
}: {
  items: FeasibilityProjectItem[];
  hrefBase: string;
  /** With it, every project says how long it has been in its status at that moment. */
  stageAsOf?: string;
  empty: { title: string; description: string; action?: ReactNode };
}) {
  if (items.length === 0) {
    return <EmptyState title={empty.title} description={empty.description} action={empty.action} />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`${hrefBase}/${item.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4 text-ink no-underline hover:border-line-hover hover:text-ink"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[15px] font-bold">{item.title}</span>
              <span className="text-[13px] text-ink-5">
                <span dir="ltr">{item.code}</span>
                {item.sector ? ` · ${item.sector}` : ''}
                {item.location ? ` · ${item.location}` : ''} · به‌روزرسانی{' '}
                {formatDateFa(item.updatedAt)}
                {item.applicant !== undefined
                  ? ` · متقاضی: ${item.applicant?.fullName ?? 'کاربر حذف‌شده'}`
                  : ''}
                {stageAsOf && item.statusSince
                  ? ` · ${daysFa(stageDays(item.statusSince, stageAsOf))} در این مرحله`
                  : ''}
              </span>
            </span>
            <FeasibilityStatusBadge status={item.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ProjectFacts({ project }: { project: FeasibilityProjectDetail }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 rounded-card bg-surface p-5 text-[15px]">
      <dt className="text-ink-5">عنوان</dt>
      <dd className="font-bold">{project.title}</dd>
      <dt className="text-ink-5">کد پروژه</dt>
      <dd dir="ltr" className="text-right font-mono">
        {project.code}
      </dd>
      <dt className="text-ink-5">وضعیت</dt>
      <dd>
        <FeasibilityStatusBadge status={project.status} />
      </dd>
      <dt className="text-ink-5">حوزه طرح</dt>
      <dd>{project.sector ?? <span className="text-ink-5">ثبت نشده</span>}</dd>
      <dt className="text-ink-5">محل اجرا</dt>
      <dd>{project.location ?? <span className="text-ink-5">ثبت نشده</span>}</dd>
      <dt className="text-ink-5">تاریخ ایجاد</dt>
      <dd>{formatDateFa(project.createdAt)}</dd>
      <dt className="text-ink-5">شرح طرح</dt>
      <dd className="leading-loose whitespace-pre-line">
        {project.summary ?? <span className="text-ink-5">ثبت نشده</span>}
      </dd>
    </dl>
  );
}

export function ProjectAttachments({ project }: { project: FeasibilityProjectDetail }) {
  if (project.attachments.length === 0) return null;
  return (
    <section aria-labelledby="attachments-title">
      <h2 id="attachments-title" className="mb-3 text-base font-extrabold text-brand-900">
        پیوست‌های درخواست اولیه
      </h2>
      <FileList files={project.attachments} />
    </section>
  );
}

export function ProjectTimeline({ events }: { events: FeasibilityStatusEvent[] }) {
  return (
    <ol className="flex flex-col gap-4 border-s-2 border-line ps-5">
      {events.map((event, i) => (
        <li key={`${event.createdAt}-${i}`} className="relative">
          <span
            aria-hidden="true"
            className="absolute top-1.5 -start-[27px] size-3 rounded-full border-2 border-white bg-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <FeasibilityStatusBadge status={event.toStatus} />
            <time dateTime={event.createdAt} className="text-[13px] text-ink-5">
              {formatDateTimeFa(event.createdAt)}
            </time>
          </div>
          <p className="mt-1 text-[13px] text-ink-5">
            {FEASIBILITY_ACTOR_LABELS_FA[event.actor]}
            {event.by ? ` · ${event.by.fullName}` : ''}
          </p>
          {event.note ? (
            <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-ink-3">
              {event.note}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export interface ProjectFormValues {
  title: string;
  sector: string;
  location: string;
  summary: string;
}

type FieldErrors = Partial<Record<keyof ProjectFormValues, string>>;

export type ProjectFormResult =
  { ok: true } | { ok: false; message: string; details: ApiErrorDetail[] };

/** The details of a project, for a new draft and for changing one. */
export function ProjectForm({
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
}: {
  initial: ProjectFormValues;
  submitLabel: string;
  busyLabel: string;
  /** Receives the validated details; optional ones that were left empty are absent. */
  onSubmit: (values: {
    title: string;
    sector?: string;
    location?: string;
    summary: string;
  }) => Promise<ProjectFormResult>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof ProjectFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const fieldErrors = (details: readonly { path: string; message: string }[]): FieldErrors =>
    Object.fromEntries(
      details.filter((d) => d.path in values).map((d) => [d.path, d.message]),
    ) as FieldErrors;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = createFeasibilityProjectSchema.safeParse({
      title: values.title,
      sector: values.sector || undefined,
      location: values.location.trim() || undefined,
      summary: values.summary,
    });
    if (!parsed.success) {
      setErrors(
        fieldErrors(
          parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await onSubmit({ ...parsed.data, summary: parsed.data.summary ?? '' });
    setBusy(false);
    if (!result.ok) {
      setErrors(fieldErrors(result.details));
      setError(result.message);
    }
  };

  return (
    <form
      method="post"
      onSubmit={(e) => void submit(e)}
      noValidate
      className="flex max-w-2xl flex-col gap-4"
    >
      <FieldShell id="fp-title" label="عنوان طرح" required error={errors.title}>
        <TextInput
          id="fp-title"
          value={values.title}
          maxLength={200}
          error={errors.title}
          onChange={(e) => set('title')(e.target.value)}
        />
      </FieldShell>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4">
        <FieldShell id="fp-sector" label="حوزه طرح" error={errors.sector}>
          <Select
            id="fp-sector"
            value={values.sector}
            error={errors.sector}
            onChange={(e) => set('sector')(e.target.value)}
          >
            <option value="">انتخاب کنید</option>
            {FEASIBILITY_SECTORS.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </Select>
        </FieldShell>
        <FieldShell id="fp-location" label="محل اجرا" error={errors.location}>
          <TextInput
            id="fp-location"
            value={values.location}
            maxLength={200}
            error={errors.location}
            onChange={(e) => set('location')(e.target.value)}
          />
        </FieldShell>
      </div>
      <FieldShell
        id="fp-summary"
        label="شرح طرح"
        hint="محصول یا خدمت، ظرفیت و هر آنچه کارشناسان برای بررسی اولیه باید بدانند. حوزه و شرح طرح برای ارسال لازم است."
        error={errors.summary}
      >
        <TextArea
          id="fp-summary"
          rows={7}
          hasHint
          value={values.summary}
          maxLength={5000}
          error={errors.summary}
          onChange={(e) => set('summary')(e.target.value)}
        />
      </FieldShell>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            انصراف
          </Button>
        ) : null}
      </div>
    </form>
  );
}
