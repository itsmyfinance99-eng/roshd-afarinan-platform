'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ROLE_LABELS_FA } from '@roshd/types';
import { Button, ErrorMessage, FieldShell, SuccessMessage, TextInput } from '@roshd/ui';
import { updateProfileSchema } from '@roshd/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMe } from '@/components/dashboard/me-context';
import { PageTitle } from '@/components/dashboard/ui';
import { ChangePasswordForm, LogoutAllButton } from '@/components/forms/password-forms';
import { apiFetch } from '@/lib/api-client';

interface Values {
  fullName: string;
  mobile: string | null;
}

export default function ProfilePage() {
  const me = useMe();
  const router = useRouter();
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(updateProfileSchema as never) as never,
    defaultValues: { fullName: me.fullName, mobile: me.mobile ?? '' },
    mode: 'onTouched',
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setStatus(null);
    const result = await apiFetch('/users/me', { method: 'PATCH', body: values });
    if (result.ok) {
      setStatus({ kind: 'ok', message: 'اطلاعات حساب ذخیره شد.' });
      router.refresh();
      return;
    }
    for (const d of result.details) form.setError(d.path as keyof Values, { message: d.message });
    setStatus({ kind: 'error', message: result.message });
  });

  return (
    <>
      <PageTitle title="پروفایل" />
      <dl className="mb-8 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 rounded-card bg-surface p-5 text-[15px]">
        <dt className="text-ink-5">ایمیل</dt>
        <dd dir="ltr" className="text-right">
          {me.email}
        </dd>
        <dt className="text-ink-5">نقش‌ها</dt>
        <dd>{me.roles.map((r) => ROLE_LABELS_FA[r]).join('، ')}</dd>
      </dl>
      <form method="post" onSubmit={onSubmit} noValidate className="flex max-w-lg flex-col gap-4">
        <FieldShell
          id="p-name"
          label="نام و نام خانوادگی"
          required
          error={errors.fullName?.message}
        >
          <TextInput id="p-name" error={errors.fullName?.message} {...form.register('fullName')} />
        </FieldShell>
        <FieldShell id="p-mobile" label="شماره موبایل" error={errors.mobile?.message}>
          <TextInput
            id="p-mobile"
            dir="ltr"
            inputMode="tel"
            placeholder="09xxxxxxxxx"
            className="text-right"
            error={errors.mobile?.message}
            {...form.register('mobile', { setValueAs: (v: string) => (v === '' ? null : v) })}
          />
        </FieldShell>
        {status?.kind === 'ok' ? <SuccessMessage>{status.message}</SuccessMessage> : null}
        {status?.kind === 'error' ? <ErrorMessage>{status.message}</ErrorMessage> : null}
        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
          </Button>
        </div>
      </form>

      <section aria-labelledby="security-title" className="mt-12 flex flex-col gap-4">
        <h2 id="security-title" className="text-lg font-extrabold text-brand-900">
          امنیت حساب
        </h2>
        <h3 className="text-sm font-bold text-ink-2">تغییر رمز عبور</h3>
        <ChangePasswordForm />
        <h3 className="mt-4 text-sm font-bold text-ink-2">نشست‌ها</h3>
        <p className="max-w-lg text-sm leading-loose text-ink-4">
          اگر حساب خود را روی دستگاه دیگری باز گذاشته‌اید یا به ورود ناشناس مشکوک هستید، از همه
          دستگاه‌ها خارج شوید.
        </p>
        <LogoutAllButton />
      </section>
    </>
  );
}
