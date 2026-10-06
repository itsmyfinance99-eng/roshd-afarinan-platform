'use client';

import {
  Button,
  ErrorMessage,
  FieldShell,
  formatDateFa,
  formatNumber,
  formatRials,
  SuccessMessage,
  TextArea,
  TextInput,
} from '@roshd/ui';
import {
  FEASIBILITY_ESTIMATE_SCOPE_MAX,
  FEASIBILITY_NOTE_MAX,
  feasibilityCostEstimateSchema,
  toLatinDigits,
} from '@roshd/validation';
import { type FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { FeasibilityCostEstimate, FeasibilityProjectDetail } from './types';

/** The cost estimate of a study as the applicant and the staff read it (ST-35.08). */
export function EstimateFacts({ estimate }: { estimate: FeasibilityCostEstimate }) {
  return (
    <section
      aria-labelledby="estimate-title"
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <h2 id="estimate-title" className="text-base font-extrabold text-brand-900">
        برآورد هزینه و مدت مطالعه
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[15px]">
        <dt className="text-ink-5">مبلغ برآورد</dt>
        <dd className="font-bold">{formatRials(estimate.amountRials)}</dd>
        <dt className="text-ink-5">مدت انجام</dt>
        <dd>{formatNumber(estimate.durationDays)} روز</dd>
        <dt className="text-ink-5">تاریخ برآورد</dt>
        <dd>{formatDateFa(estimate.createdAt)}</dd>
        <dt className="text-ink-5">شرح کار</dt>
        <dd className="whitespace-pre-line leading-relaxed">{estimate.scope}</dd>
      </dl>
    </section>
  );
}

const FIELDS = ['amountRials', 'durationDays', 'scope', 'note'] as const;
type Field = (typeof FIELDS)[number];
type FieldErrors = Partial<Record<Field, string>>;
const FIELD_IDS: Record<Field, string> = {
  amountRials: 'estimate-amount',
  durationDays: 'estimate-days',
  scope: 'estimate-scope',
  note: 'estimate-note',
};

const fieldErrors = (details: readonly { path: string; message: string }[]): FieldErrors =>
  Object.fromEntries(
    details
      .filter((detail) => (FIELDS as readonly string[]).includes(detail.path))
      .map((detail) => [detail.path, detail.message]),
  ) as FieldErrors;

/** What the typed amount reads as, so that a missing or extra zero is seen before it is sent. */
const amountPreview = (typed: string): string | null => {
  const digits = toLatinDigits(typed).replace(/[\s,٬]/g, '');
  return /^[1-9]\d{0,14}$/.test(digits) ? formatRials(digits) : null;
};

/**
 * The staff enter what the study costs, what it covers and how long it takes (ST-35.08). Nothing
 * is computed: the amount is what is typed here. With it the project goes to the applicant.
 */
export function EstimateForm({
  project,
  onChanged,
}: {
  project: FeasibilityProjectDetail;
  onChanged: () => void;
}) {
  const [values, setValues] = useState({ amountRials: '', durationDays: '', scope: '', note: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!project.access.transitions.includes('COST_ESTIMATED')) {
    // Said while the estimate waits for the applicant; a later step has its own message.
    return done && project.status === 'COST_ESTIMATED' ? (
      <SuccessMessage>برآورد ثبت شد و برای تصمیم متقاضی فرستاده شد.</SuccessMessage>
    ) : null;
  }

  const set = (field: Field) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const refuse = (found: FieldErrors) => {
    setErrors(found);
    const first = FIELDS.find((field) => found[field]);
    if (first) document.getElementById(FIELD_IDS[first])?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const days = toLatinDigits(values.durationDays).trim();
    const parsed = feasibilityCostEstimateSchema.safeParse({
      amountRials: values.amountRials,
      scope: values.scope,
      // Anything but digits is not a number of days.
      durationDays: /^\d+$/.test(days) ? Number(days) : Number.NaN,
      note: values.note,
    });
    if (!parsed.success) {
      refuse(
        fieldErrors(
          parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
      return;
    }
    const { note, ...estimate } = parsed.data;
    if (
      !window.confirm(
        `برآورد ${formatRials(estimate.amountRials)} برای متقاضی فرستاده شود؟ برآورد پس از ثبت تغییر نمی‌کند.`,
      )
    ) {
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await apiFetch(`/feasibility-projects/${project.id}/cost-estimate`, {
      method: 'POST',
      body: { ...estimate, note: note || undefined },
    });
    if (result.ok) {
      // Still busy: the form gives way to the estimate as soon as the project is read again.
      setDone(true);
      onChanged();
      return;
    }
    setBusy(false);
    setError(result.message);
    refuse(fieldErrors(result.details));
  };

  const preview = amountPreview(values.amountRials);

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-labelledby="estimate-form-title"
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <h2 id="estimate-form-title" className="text-base font-extrabold text-brand-900">
        ثبت برآورد هزینه
      </h2>
      <p className="text-sm leading-relaxed text-ink-3">
        مبلغ، شرح کار و مدت مطالعه را بنویسید. سامانه مبلغی محاسبه نمی‌کند؛ پس از ثبت، متقاضی برآورد
        را می‌پذیرد یا رد می‌کند.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldShell
          id={FIELD_IDS.amountRials}
          label="مبلغ برآورد (ریال)"
          required
          error={errors.amountRials}
          hint={preview ?? 'مبلغ را به ریال و بدون اعشار بنویسید.'}
        >
          <TextInput
            id={FIELD_IDS.amountRials}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            hasHint
            value={values.amountRials}
            maxLength={30}
            error={errors.amountRials}
            onChange={(e) => set('amountRials')(e.target.value)}
          />
        </FieldShell>
        <FieldShell
          id={FIELD_IDS.durationDays}
          label="مدت انجام (روز)"
          required
          error={errors.durationDays}
        >
          <TextInput
            id={FIELD_IDS.durationDays}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            value={values.durationDays}
            maxLength={6}
            error={errors.durationDays}
            onChange={(e) => set('durationDays')(e.target.value)}
          />
        </FieldShell>
      </div>
      <FieldShell
        id={FIELD_IDS.scope}
        label="شرح کار"
        required
        error={errors.scope}
        hint="آنچه مطالعه در برابر این مبلغ در بر می‌گیرد."
      >
        <TextArea
          id={FIELD_IDS.scope}
          rows={4}
          hasHint
          value={values.scope}
          maxLength={FEASIBILITY_ESTIMATE_SCOPE_MAX}
          error={errors.scope}
          onChange={(e) => set('scope')(e.target.value)}
        />
      </FieldShell>
      <FieldShell
        id={FIELD_IDS.note}
        label="پیام برای متقاضی (اختیاری)"
        error={errors.note}
        hint="متقاضی این پیام را در روند پروژه و در اعلان می‌خواند."
      >
        <TextArea
          id={FIELD_IDS.note}
          rows={2}
          hasHint
          value={values.note}
          maxLength={FEASIBILITY_NOTE_MAX}
          error={errors.note}
          onChange={(e) => set('note')(e.target.value)}
        />
      </FieldShell>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'در حال ثبت…' : 'ثبت برآورد و ارسال برای متقاضی'}
        </Button>
      </div>
    </form>
  );
}

const DECISIONS = {
  CONTRACT_PENDING: {
    label: 'پذیرش برآورد',
    busy: 'در حال ثبت…',
    confirm: 'برآورد پذیرفته شود؟ با پذیرش، پروژه وارد مرحله قرارداد می‌شود.',
    done: 'برآورد را پذیرفتید. پروژه وارد مرحله قرارداد شد.',
  },
  ARCHIVED: {
    label: 'رد برآورد',
    busy: 'در حال ثبت…',
    confirm: 'برآورد رد شود؟ با رد برآورد، پروژه بایگانی می‌شود و دیگر تغییر نمی‌کند.',
    done: 'برآورد را رد کردید و پروژه بایگانی شد.',
  },
} as const;
type Decision = keyof typeof DECISIONS;

/** The applicant accepts the estimate, or declines it and so closes the project (ST-35.08). */
export function EstimateDecision({
  project,
  onChanged,
}: {
  project: FeasibilityProjectDetail;
  onChanged: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Decision | null>(null);

  // The decision is offered while the estimate waits for it, and only to the applicant.
  if (
    project.status !== 'COST_ESTIMATED' ||
    !project.access.transitions.includes('CONTRACT_PENDING')
  ) {
    // The message of a decision is said while the project is where that decision took it.
    return done && project.status === done ? (
      <SuccessMessage>{DECISIONS[done].done}</SuccessMessage>
    ) : null;
  }

  const decide = async (to: Decision) => {
    setError(null);
    if (!window.confirm(DECISIONS[to].confirm)) return;
    setBusy(to);
    const result = await apiFetch(`/feasibility-projects/${project.id}/transitions`, {
      method: 'POST',
      body: { to, note: note.trim() || undefined },
    });
    if (result.ok) {
      // Still busy: the form goes as soon as the project is read again.
      setDone(to);
      onChanged();
      return;
    }
    setBusy(null);
    setError(result.message);
  };

  return (
    <form
      method="post"
      onSubmit={(event: FormEvent) => event.preventDefault()}
      aria-labelledby="decision-title"
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <h2 id="decision-title" className="text-base font-extrabold text-brand-900">
        تصمیم درباره برآورد
      </h2>
      <p className="text-sm leading-relaxed text-ink-3">
        با پذیرش برآورد، پروژه وارد مرحله قرارداد می‌شود. با رد آن، پروژه بایگانی می‌شود.
      </p>
      <FieldShell id="decision-note" label="پیام برای کارشناسان (اختیاری)">
        <TextArea
          id="decision-note"
          rows={3}
          value={note}
          maxLength={FEASIBILITY_NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
        />
      </FieldShell>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <div className="flex flex-wrap gap-3">
        {(Object.keys(DECISIONS) as Decision[])
          // Without an estimate there is nothing to accept; declining stays open.
          .filter(
            (to) =>
              project.access.transitions.includes(to) &&
              (to === 'ARCHIVED' || project.costEstimate !== null),
          )
          .map((to) => (
            <Button
              key={to}
              variant={to === 'CONTRACT_PENDING' ? 'primary' : 'ghost'}
              disabled={busy !== null}
              onClick={() => void decide(to)}
            >
              {busy === to ? DECISIONS[to].busy : DECISIONS[to].label}
            </Button>
          ))}
      </div>
    </form>
  );
}
