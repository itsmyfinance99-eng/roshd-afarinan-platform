'use client';

import { Button, ErrorMessage, FieldShell, SuccessMessage, TextInput } from '@roshd/ui';
import { forgotPasswordSchema, PASSWORD_MAX, passwordSchema, z } from '@roshd/validation';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { notifySessionChange } from '@/lib/session';
import { useApiForm } from './use-api-form';
import { useHydrated } from './use-hydrated';

const MISMATCH = 'تکرار رمز با رمز جدید یکسان نیست.';

const resetFormSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { error: MISMATCH, path: ['confirm'] });

const changeFormSchema = z
  .object({
    currentPassword: z.string().min(1, { error: 'این فیلد الزامی است.' }).max(PASSWORD_MAX),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { error: MISMATCH, path: ['confirm'] })
  .refine((v) => v.currentPassword !== v.newPassword, {
    error: 'رمز جدید باید با رمز فعلی متفاوت باشد.',
    path: ['newPassword'],
  });

const PASSWORD_HINT = 'حداقل ۸ نویسه، شامل حرف و عدد.';

export function ForgotPasswordForm() {
  const hydrated = useHydrated();
  const { form, status, onSubmit, fieldError, submitting } = useApiForm<
    { email: string },
    { message: string }
  >({ schema: forgotPasswordSchema, path: '/auth/password/forgot', defaultValues: { email: '' } });

  if (status.state === 'success') {
    return (
      <div className="flex flex-col gap-4">
        <SuccessMessage>{status.result.message}</SuccessMessage>
        <p className="text-sm leading-loose text-ink-4">
          لینک بازیابی فقط برای مدت کوتاهی معتبر است. اگر ایمیلی دریافت نکردید، پوشه هرزنامه را
          بررسی کنید یا با پشتیبانی تماس بگیرید.
        </p>
        <Link href="/login" className="font-bold">
          بازگشت به ورود
        </Link>
      </div>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FieldShell id="fp-email" label="ایمیل حساب کاربری" required error={fieldError('email')}>
        <TextInput
          id="fp-email"
          type="email"
          dir="ltr"
          autoComplete="email"
          className="text-right"
          error={fieldError('email')}
          {...form.register('email')}
        />
      </FieldShell>
      {status.state === 'error' ? <ErrorMessage>{status.message}</ErrorMessage> : null}
      <Button type="submit" size="lg" disabled={submitting || !hydrated}>
        {submitting ? 'در حال ارسال…' : 'ارسال لینک بازیابی'}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login">بازگشت به ورود</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const hydrated = useHydrated();
  const { form, status, onSubmit, fieldError, submitting } = useApiForm<
    { password: string; confirm: string },
    null
  >({
    schema: resetFormSchema,
    path: '/auth/password/reset',
    defaultValues: { password: '', confirm: '' },
    transform: (v) => ({ token, password: v.password }),
  });

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorMessage>لینک بازیابی کامل نیست. لطفاً دوباره درخواست دهید.</ErrorMessage>
        <Link href="/forgot-password" className="font-bold">
          درخواست لینک جدید
        </Link>
      </div>
    );
  }
  if (status.state === 'success') {
    return (
      <div className="flex flex-col gap-4">
        <SuccessMessage>
          رمز عبور شما تغییر کرد و از همه دستگاه‌ها خارج شدید. اکنون با رمز جدید وارد شوید.
        </SuccessMessage>
        <Link href="/login" className="font-bold">
          ورود به حساب
        </Link>
      </div>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FieldShell
        id="rp-password"
        label="رمز عبور جدید"
        required
        hint={PASSWORD_HINT}
        error={fieldError('password')}
      >
        <TextInput
          id="rp-password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          hasHint
          error={fieldError('password')}
          {...form.register('password')}
        />
      </FieldShell>
      <FieldShell
        id="rp-confirm"
        label="تکرار رمز عبور جدید"
        required
        error={fieldError('confirm')}
      >
        <TextInput
          id="rp-confirm"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          error={fieldError('confirm')}
          {...form.register('confirm')}
        />
      </FieldShell>
      {status.state === 'error' ? (
        <div className="flex flex-col gap-2">
          <ErrorMessage>{status.message}</ErrorMessage>
          <Link href="/forgot-password" className="text-sm font-bold">
            درخواست لینک جدید
          </Link>
        </div>
      ) : null}
      <Button type="submit" size="lg" disabled={submitting || !hydrated}>
        {submitting ? 'در حال ذخیره…' : 'ذخیره رمز جدید'}
      </Button>
    </form>
  );
}

/** Change password in the dashboard; the API keeps this device signed in with a fresh session. */
export function ChangePasswordForm() {
  const { form, status, onSubmit, fieldError, submitting, reset } = useApiForm<
    { currentPassword: string; newPassword: string; confirm: string },
    unknown
  >({
    schema: changeFormSchema,
    path: '/auth/password/change',
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
    transform: (v) => ({ currentPassword: v.currentPassword, newPassword: v.newPassword }),
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex max-w-lg flex-col gap-4">
      <FieldShell id="cp-current" label="رمز فعلی" required error={fieldError('currentPassword')}>
        <TextInput
          id="cp-current"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          error={fieldError('currentPassword')}
          {...form.register('currentPassword')}
        />
      </FieldShell>
      <FieldShell
        id="cp-new"
        label="رمز جدید"
        required
        hint={PASSWORD_HINT}
        error={fieldError('newPassword')}
      >
        <TextInput
          id="cp-new"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          hasHint
          error={fieldError('newPassword')}
          {...form.register('newPassword')}
        />
      </FieldShell>
      <FieldShell id="cp-confirm" label="تکرار رمز جدید" required error={fieldError('confirm')}>
        <TextInput
          id="cp-confirm"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          error={fieldError('confirm')}
          {...form.register('confirm')}
        />
      </FieldShell>
      {status.state === 'success' ? (
        <SuccessMessage>
          رمز عبور تغییر کرد. از دستگاه‌های دیگر خارج شدید و این دستگاه وارد باقی می‌ماند.
        </SuccessMessage>
      ) : null}
      {status.state === 'error' ? <ErrorMessage>{status.message}</ErrorMessage> : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'در حال ذخیره…' : 'تغییر رمز'}
        </Button>
        {status.state === 'success' ? (
          <Button variant="ghost" onClick={reset}>
            فرم جدید
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function LogoutAllButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    const result = await apiFetch('/auth/logout-all', { method: 'POST', body: {} });
    if (result.ok) {
      notifySessionChange();
      router.replace('/login');
      return;
    }
    setBusy(false);
    setError(result.message);
  };
  return (
    <div className="flex flex-col items-start gap-3">
      <Button variant="outline" disabled={busy} onClick={() => void run()}>
        {busy ? 'در حال خروج…' : 'خروج از همه دستگاه‌ها'}
      </Button>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </div>
  );
}
