'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { type DefaultValues, type FieldValues, type Path, useForm } from 'react-hook-form';
import type { ZodType } from 'zod';
import { apiFetch } from '@/lib/api-client';

type Status<R> =
  { state: 'idle' } | { state: 'success'; result: R } | { state: 'error'; message: string };

/**
 * React Hook Form + shared Zod schema + API submission (loading / error / success states).
 * Server-side validation errors are mapped back onto the matching fields.
 */
export function useApiForm<TValues extends FieldValues, TResult>({
  schema,
  path,
  defaultValues,
  transform = (values) => values,
}: {
  schema: ZodType;
  path: string;
  defaultValues: DefaultValues<TValues>;
  transform?: (values: TValues) => unknown;
}) {
  const form = useForm<TValues>({
    // The shared schema's output type differs from the raw form values (it normalises digits etc.).
    resolver: zodResolver(schema as never) as never,
    defaultValues,
    mode: 'onTouched',
  });
  const [status, setStatus] = useState<Status<TResult>>({ state: 'idle' });

  const onSubmit = form.handleSubmit(async (values) => {
    setStatus({ state: 'idle' });
    const result = await apiFetch<TResult>(path, { method: 'POST', body: transform(values) });
    if (result.ok) {
      setStatus({ state: 'success', result: result.data });
      return;
    }
    for (const detail of result.details) {
      form.setError(detail.path as Path<TValues>, { message: detail.message });
    }
    setStatus({
      state: 'error',
      message:
        result.code === 'RATE_LIMITED'
          ? 'تعداد درخواست‌های شما زیاد بوده است. چند دقیقه بعد دوباره تلاش کنید.'
          : result.message,
    });
  });

  const reset = () => {
    form.reset(defaultValues);
    setStatus({ state: 'idle' });
  };

  const fieldError = (name: Path<TValues>): string | undefined => {
    const message = form.formState.errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  return { form, status, onSubmit, reset, fieldError, submitting: form.formState.isSubmitting };
}
