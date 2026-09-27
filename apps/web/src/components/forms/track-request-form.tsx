'use client';

import { Button, ErrorMessage, FieldShell, formatDateFa, TextInput } from '@roshd/ui';
import {
  SERVICE_REQUEST_STATUS_LABELS_FA,
  SERVICE_REQUEST_TYPE_LABELS_FA,
  trackServiceRequestSchema,
  type ServiceRequestStatus,
  type ServiceRequestType,
} from '@roshd/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api-client';
import { useHydrated } from './use-hydrated';

interface Values {
  code: string;
  mobile: string;
}

interface TrackResult {
  trackingCode: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  createdAt: string;
  updatedAt: string;
}

/** Guest tracking by code + mobile (GET /api/v1/service-requests/track). */
export function TrackRequestForm() {
  const hydrated = useHydrated();
  const form = useForm<Values>({
    resolver: zodResolver(trackServiceRequestSchema as never) as never,
    defaultValues: { code: '', mobile: '' },
    mode: 'onTouched',
  });
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setResult(null);
    const query = new URLSearchParams({ code: values.code, mobile: values.mobile });
    const res = await apiFetch<TrackResult>(`/service-requests/track?${query.toString()}`);
    if (res.ok) setResult(res.data);
    else setError(res.status === 404 ? 'درخواستی با این کد و شماره موبایل یافت نشد.' : res.message);
  });

  return (
    <div className="flex flex-col gap-6">
      <form
        method="post"
        onSubmit={onSubmit}
        noValidate
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4"
      >
        <FieldShell id="track-code" label="کد پیگیری" required error={errors.code?.message}>
          <TextInput
            id="track-code"
            dir="ltr"
            placeholder="RA-XXXXXXXX"
            className="text-right uppercase"
            error={errors.code?.message}
            {...form.register('code')}
          />
        </FieldShell>
        <FieldShell
          id="track-mobile"
          label="شماره موبایل ثبت‌شده"
          required
          error={errors.mobile?.message}
        >
          <TextInput
            id="track-mobile"
            dir="ltr"
            inputMode="tel"
            placeholder="09xxxxxxxxx"
            className="text-right"
            error={errors.mobile?.message}
            {...form.register('mobile')}
          />
        </FieldShell>
        <div className="col-span-full">
          <Button type="submit" size="lg" disabled={form.formState.isSubmitting || !hydrated}>
            {form.formState.isSubmitting ? 'در حال جستجو…' : 'پیگیری'}
          </Button>
        </div>
      </form>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {result ? (
        <dl
          role="status"
          className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 rounded-card bg-surface p-6 text-[15px]"
        >
          <dt className="text-ink-5">نوع درخواست</dt>
          <dd>{SERVICE_REQUEST_TYPE_LABELS_FA[result.type]}</dd>
          <dt className="text-ink-5">وضعیت</dt>
          <dd className="font-bold text-primary" data-testid="track-status">
            {SERVICE_REQUEST_STATUS_LABELS_FA[result.status]}
          </dd>
          <dt className="text-ink-5">تاریخ ثبت</dt>
          <dd>{formatDateFa(result.createdAt)}</dd>
          <dt className="text-ink-5">آخرین به‌روزرسانی</dt>
          <dd>{formatDateFa(result.updatedAt)}</dd>
        </dl>
      ) : null}
    </div>
  );
}
