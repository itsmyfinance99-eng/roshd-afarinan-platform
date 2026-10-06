'use client';

import { Button, ErrorMessage, FieldShell, Notice, Skeleton, TextInput } from '@roshd/ui';
import { convertRequestToProjectSchema } from '@roshd/validation';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { FeasibilityProjectItem } from './types';

/** Tells the requester that their request went on as a project, with the way to it. */
export function RequestProjectNotice({ requestId }: { requestId: string }) {
  const { state } = useApi<FeasibilityProjectItem[]>(
    `/feasibility-projects?sourceRequestId=${encodeURIComponent(requestId)}`,
  );
  // An extra on the request page: while loading, on an error and without a project it shows nothing.
  const project = state.status === 'success' ? state.data[0] : undefined;
  if (!project) return null;
  return (
    <Notice>
      این درخواست به پروژه امکان‌سنجی <span dir="ltr">{project.code}</span> تبدیل شده است و ادامه
      کار در صفحه پروژه انجام می‌شود.{' '}
      <Link href={`/dashboard/feasibility/${project.id}`} className="font-bold">
        رفتن به پروژه ‹
      </Link>
    </Notice>
  );
}

/**
 * Staff turn a feasibility request into a project of its requester, or see the project it has
 * become. Shown to holders of `feasibility:manage` on a request they can read.
 */
export function ConvertRequestToProject({
  requestId,
  onConverted,
}: {
  requestId: string;
  /** The attachments of the request have moved; the page shows it again. */
  onConverted: () => void;
}) {
  const { state, reload } = useApi<FeasibilityProjectItem[]>(
    `/feasibility-projects?scope=all&sourceRequestId=${encodeURIComponent(requestId)}`,
  );
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = convertRequestToProjectSchema.shape.title.safeParse(title);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    const result = await apiFetch('/feasibility-projects/from-request', {
      method: 'POST',
      body: { requestId, title: parsed.data },
    });
    setBusy(false);
    if (result.ok) {
      setTitle('');
      reload({ silent: true });
      onConverted();
      return;
    }
    setFieldError(result.details.find((d) => d.path === 'title')?.message);
    setError(result.message);
    // Somebody else may have converted it meanwhile.
    if (result.status === 409) reload({ silent: true });
  };

  return (
    <section
      aria-labelledby="convert-title"
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <h2 id="convert-title" className="text-base font-extrabold text-brand-900">
        پروژه امکان‌سنجی
      </h2>
      {state.status === 'loading' ? (
        <div aria-busy="true" aria-label="در حال بارگذاری">
          <Skeleton className="h-12" />
        </div>
      ) : state.status === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <ErrorMessage>{state.message}</ErrorMessage>
          <Button variant="outline" size="sm" onClick={() => reload()}>
            تلاش دوباره
          </Button>
        </div>
      ) : state.data[0] ? (
        <p className="text-[15px] leading-relaxed">
          این درخواست به پروژه{' '}
          <Link href={`/dashboard/manage/feasibility/${state.data[0].id}`} dir="ltr">
            {state.data[0].code}
          </Link>{' '}
          تبدیل شده است.
        </p>
      ) : (
        <form
          method="post"
          onSubmit={(e) => void submit(e)}
          noValidate
          className="flex flex-col gap-3"
        >
          <p className="text-sm leading-relaxed text-ink-3">
            پروژه به‌صورت پیش‌نویس به نام متقاضی ساخته می‌شود تا آن را کامل و ارسال کند. پیوست‌های
            درخواست به پروژه منتقل می‌شود.
          </p>
          <FieldShell id="convert-project-title" label="عنوان پروژه" required error={fieldError}>
            <TextInput
              id="convert-project-title"
              value={title}
              maxLength={200}
              error={fieldError}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FieldShell>
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'در حال ساخت…' : 'تبدیل به پروژه'}
          </Button>
        </form>
      )}
    </section>
  );
}
