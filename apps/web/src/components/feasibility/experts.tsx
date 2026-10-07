'use client';

import {
  Button,
  ErrorMessage,
  FieldShell,
  formatDateFa,
  Select,
  Skeleton,
  SuccessMessage,
} from '@roshd/ui';
import { MAX_PROJECT_EXPERTS } from '@roshd/validation';
import { type FormEvent, useState } from 'react';
import type { StaffRef } from '@/components/dashboard/types';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { FeasibilityProjectDetail } from './types';

const NONE = '';

/**
 * The experts of a project (ST-35.10). Staff and the experts read who works on it; staff with
 * `feasibility:manage` assign an expert and end an assignment. The API decides what the caller
 * may do (`access.assignExperts`, `access.releaseExperts`) and re-checks every choice.
 */
export function ProjectExperts({
  project,
  onChanged,
}: {
  project: FeasibilityProjectDetail;
  onChanged: () => void;
}) {
  const experts = project.experts ?? [];
  const full = experts.length >= MAX_PROJECT_EXPERTS;
  const canAssign = project.access.assignExperts && !full;
  // Only who assigns needs the list of candidates.
  const { state, reload } = useApi<StaffRef[]>(canAssign ? '/feasibility-projects/experts' : null);
  const [selected, setSelected] = useState(NONE);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const assigned = new Set(experts.map(({ expert }) => expert.id));
  const candidates =
    state.status === 'success' ? state.data.filter((candidate) => !assigned.has(candidate.id)) : [];

  const assign = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (selected === NONE) {
      setFieldError('کارشناسی را انتخاب کنید.');
      document.getElementById('expert-pick')?.focus();
      return;
    }
    setFieldError(undefined);
    setBusy('assign');
    const result = await apiFetch(`/feasibility-projects/${project.id}/experts`, {
      method: 'POST',
      body: { expertId: selected },
    });
    setBusy(null);
    if (result.ok) {
      setSelected(NONE);
      setMessage({ ok: true, text: 'پروژه به کارشناس سپرده شد و به او اطلاع داده شد.' });
      onChanged();
      return;
    }
    setFieldError(result.details.find((detail) => detail.path === 'expertId')?.message);
    setMessage({ ok: false, text: result.message });
  };

  const release = async (expert: StaffRef) => {
    setMessage(null);
    if (
      !window.confirm(
        `کار ${expert.fullName} روی این پروژه پایان یابد؟ او دیگر به پروژه، مدارک و مدل مالی آن دسترسی نخواهد داشت.`,
      )
    ) {
      return;
    }
    setBusy(expert.id);
    const result = await apiFetch(
      `/feasibility-projects/${project.id}/experts/${encodeURIComponent(expert.id)}`,
      { method: 'DELETE' },
    );
    setBusy(null);
    if (result.ok) {
      setMessage({ ok: true, text: `کار ${expert.fullName} روی این پروژه پایان یافت.` });
    } else {
      setMessage({ ok: false, text: result.message });
    }
    // Also after a refusal: somebody else may have changed the experts meanwhile.
    onChanged();
  };

  return (
    <section aria-labelledby="experts-title" className="flex flex-col gap-3">
      <h2 id="experts-title" className="text-base font-extrabold text-brand-900">
        کارشناسان پروژه
      </h2>
      {experts.length > 0 ? (
        <ul className="flex flex-col gap-2 text-[15px]">
          {experts.map(({ expert, since }) => (
            <li key={expert.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {expert.fullName}
                <span className="text-[13px] text-ink-5"> · از {formatDateFa(since)}</span>
              </span>
              {project.access.releaseExperts ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  aria-label={`پایان کار ${expert.fullName} روی پروژه`}
                  onClick={() => void release(expert)}
                >
                  {busy === expert.id ? 'در حال ثبت…' : 'پایان کار'}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-ink-5">هنوز کارشناسی به این پروژه سپرده نشده است.</p>
      )}
      {project.access.assignExperts && full ? (
        <p className="text-[13px] text-ink-5">
          این پروژه بیشترین تعداد کارشناس را دارد. برای سپردن به کارشناس دیگر، کار یکی را پایان
          دهید.
        </p>
      ) : null}
      {canAssign ? (
        <form
          method="post"
          onSubmit={(event) => void assign(event)}
          aria-label="سپردن پروژه به کارشناس"
          className="flex flex-col gap-3 rounded-card border border-line p-4"
        >
          {state.status === 'loading' ? (
            <div aria-busy="true" aria-label="در حال بارگذاری کارشناسان">
              <Skeleton className="h-11" />
            </div>
          ) : state.status === 'error' ? (
            <div className="flex flex-col items-start gap-2">
              <ErrorMessage>{state.message}</ErrorMessage>
              <Button variant="outline" size="sm" onClick={() => reload()}>
                تلاش دوباره
              </Button>
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-[15px] text-ink-5">
              کارشناس دیگری برای سپردن این پروژه نیست. نقش «کارشناس» را در مدیریت کاربران به همکاران
              بدهید.
            </p>
          ) : (
            <>
              <FieldShell
                id="expert-pick"
                label="سپردن به کارشناس"
                hint="کارشناس پاسخ‌ها، مدارک و مدل مالی این پروژه را می‌بیند؛ برآورد هزینه و قرارداد را نه."
                error={fieldError}
              >
                <Select
                  id="expert-pick"
                  hasHint
                  value={selected}
                  error={fieldError}
                  onChange={(event) => {
                    setSelected(event.target.value);
                    setFieldError(undefined);
                  }}
                >
                  <option value={NONE}>انتخاب کنید…</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.fullName}
                    </option>
                  ))}
                </Select>
              </FieldShell>
              <div>
                <Button type="submit" disabled={busy !== null}>
                  {busy === 'assign' ? 'در حال ثبت…' : 'سپردن پروژه'}
                </Button>
              </div>
            </>
          )}
        </form>
      ) : null}
      {message ? (
        message.ok ? (
          <SuccessMessage>{message.text}</SuccessMessage>
        ) : (
          <ErrorMessage>{message.text}</ErrorMessage>
        )
      ) : null}
    </section>
  );
}
