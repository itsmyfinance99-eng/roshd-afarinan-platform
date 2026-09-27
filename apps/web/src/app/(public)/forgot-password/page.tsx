import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/forms/password-forms';
import { AuthCard } from '@/components/layout/auth-card';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'بازیابی رمز عبور',
  path: '/forgot-password',
  noIndex: true,
});

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="بازیابی رمز عبور"
      lead="ایمیل حساب خود را وارد کنید تا لینک تعیین رمز جدید برایتان ارسال شود."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
