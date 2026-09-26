'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, ErrorMessage, FieldShell, TextInput } from '@roshd/ui';
import { loginSchema, registerSchema } from '@roshd/validation';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { type FieldValues, type Path, useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api-client';
import { safeNextPath } from '@/lib/safe-redirect';
import { notifySessionChange } from '@/lib/session';
import { useHydrated } from './use-hydrated';

const optional = { setValueAs: (v: string) => (v === '' ? undefined : v) };

function useAuthForm<T extends FieldValues>(schema: unknown, path: string, defaults: T) {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<T>({
    resolver: zodResolver(schema as never) as never,
    defaultValues: defaults as never,
    mode: 'onTouched',
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const result = await apiFetch(path, { method: 'POST', body: values, retryAuth: false });
    if (result.ok) {
      notifySessionChange();
      router.replace(next);
      router.refresh();
      return;
    }
    for (const d of result.details) form.setError(d.path as Path<T>, { message: d.message });
    setError(
      result.code === 'RATE_LIMITED'
        ? 'تلاش‌های شما بیش از حد مجاز بوده است. چند دقیقه بعد دوباره تلاش کنید.'
        : result.message,
    );
  });

  const err = (name: Path<T>) => {
    const message = form.formState.errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  return { form, onSubmit, error, err, hydrated, next };
}

export function LoginForm() {
  const { form, onSubmit, error, err, hydrated, next } = useAuthForm(loginSchema, '/auth/login', {
    email: '',
    password: '',
  });
  const submitting = form.formState.isSubmitting;
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FieldShell id="login-email" label="ایمیل" required error={err('email')}>
        <TextInput
          id="login-email"
          type="email"
          dir="ltr"
          autoComplete="email"
          className="text-right"
          error={err('email')}
          {...form.register('email')}
        />
      </FieldShell>
      <FieldShell id="login-password" label="رمز عبور" required error={err('password')}>
        <TextInput
          id="login-password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          error={err('password')}
          {...form.register('password')}
        />
      </FieldShell>
      <p className="-mt-2 text-sm">
        <Link href="/forgot-password">رمز عبور را فراموش کرده‌اید؟</Link>
      </p>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <Button type="submit" size="lg" disabled={submitting || !hydrated}>
        {submitting ? 'در حال ورود…' : 'ورود'}
      </Button>
      <p className="text-center text-sm text-ink-4">
        حساب کاربری ندارید؟{' '}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-bold">
          ثبت‌نام کنید
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const { form, onSubmit, error, err, hydrated, next } = useAuthForm(
    registerSchema,
    '/auth/register',
    { fullName: '', email: '', mobile: undefined as string | undefined, password: '' },
  );
  const submitting = form.formState.isSubmitting;
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FieldShell id="reg-name" label="نام و نام خانوادگی" required error={err('fullName')}>
        <TextInput
          id="reg-name"
          autoComplete="name"
          error={err('fullName')}
          {...form.register('fullName')}
        />
      </FieldShell>
      <FieldShell id="reg-email" label="ایمیل" required error={err('email')}>
        <TextInput
          id="reg-email"
          type="email"
          dir="ltr"
          autoComplete="email"
          className="text-right"
          error={err('email')}
          {...form.register('email')}
        />
      </FieldShell>
      <FieldShell id="reg-mobile" label="شماره موبایل (اختیاری)" error={err('mobile')}>
        <TextInput
          id="reg-mobile"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          placeholder="09xxxxxxxxx"
          className="text-right"
          error={err('mobile')}
          {...form.register('mobile', optional)}
        />
      </FieldShell>
      <FieldShell
        id="reg-password"
        label="رمز عبور"
        required
        error={err('password')}
        hint="حداقل ۸ نویسه، شامل حرف و عدد"
      >
        <TextInput
          id="reg-password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          hasHint
          error={err('password')}
          {...form.register('password')}
        />
      </FieldShell>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <Button type="submit" size="lg" disabled={submitting || !hydrated}>
        {submitting ? 'در حال ثبت‌نام…' : 'ایجاد حساب کاربری'}
      </Button>
      <p className="text-center text-sm text-ink-4">
        قبلاً ثبت‌نام کرده‌اید؟{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-bold">
          وارد شوید
        </Link>
      </p>
    </form>
  );
}
