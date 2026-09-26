'use client';

import { Button, ErrorMessage, FieldShell, Select, Skeleton, SuccessMessage } from '@roshd/ui';
import { type FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { StaffRef } from './types';

const NONE = '';

/** Staff filter options shared by the request and ticket queues (`assignee` query param). */
export const ASSIGNEE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'همه ارجاع‌ها' },
  { value: 'me', label: 'ارجاع‌شده به من' },
  { value: 'none', label: 'ارجاع‌نشده' },
];

export function AssigneeName({ assignee }: { assignee: StaffRef | null | undefined }) {
  return <>{assignee ? assignee.fullName : 'ارجاع‌نشده'}</>;
}

/**
 * Assign / unassign form. `resource` is the API collection (`/service-requests` or `/tickets`);
 * candidates come from `<resource>/assignees`, and the API re-checks every choice.
 */
export function AssigneePicker({
  resource,
  id,
  current,
  onChanged,
}: {
  resource: '/service-requests' | '/tickets';
  id: string;
  current: StaffRef | null | undefined;
  onChanged: () => void;
}) {
  const { state, reload } = useApi<StaffRef[]>(`${resource}/assignees`);
  const [selected, setSelected] = useState<string>(current?.id ?? NONE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fieldId = `assignee-${id}`;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await apiFetch(`${resource}/${id}/assignee`, {
      method: 'PATCH',
      body: { assigneeId: selected || null },
    });
    setBusy(false);
    if (result.ok) {
      setMessage({ ok: true, text: selected ? 'ارجاع ثبت شد.' : 'ارجاع برداشته شد.' });
      onChanged();
    } else {
      setMessage({ ok: false, text: result.message });
    }
  };

  // The current assignee stays selectable even if they lost the permission since.
  const options =
    state.status === 'success'
      ? current && !state.data.some((s) => s.id === current.id)
        ? [current, ...state.data]
        : state.data
      : [];

  return (
    <form
      method="post"
      onSubmit={(e) => void submit(e)}
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <h2 className="text-base font-extrabold text-brand-900">ارجاع به کارشناس</h2>
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
      ) : (
        <FieldShell id={fieldId} label="کارشناس">
          <Select id={fieldId} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value={NONE}>بدون ارجاع</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </Select>
        </FieldShell>
      )}
      {message ? (
        message.ok ? (
          <SuccessMessage>{message.text}</SuccessMessage>
        ) : (
          <ErrorMessage>{message.text}</ErrorMessage>
        )
      ) : null}
      <Button
        type="submit"
        disabled={busy || state.status !== 'success' || selected === (current?.id ?? NONE)}
      >
        {busy ? 'در حال ثبت…' : 'ثبت ارجاع'}
      </Button>
    </form>
  );
}
