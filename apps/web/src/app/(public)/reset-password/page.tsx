import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/forms/password-forms';
import { AuthCard } from '@/components/layout/auth-card';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'تعیین رمز جدید',
  path: '/reset-password',
  noIndex: true,
});

export default function ResetPasswordPage() {
  return (
    <AuthCard title="تعیین رمز جدید" lead="رمز جدید حساب خود را وارد کنید.">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
