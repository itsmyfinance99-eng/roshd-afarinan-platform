import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from '@/components/forms/email-verification';
import { AuthCard } from '@/components/layout/auth-card';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'تأیید ایمیل',
  path: '/verify-email',
  noIndex: true,
});

export default function VerifyEmailPage() {
  return (
    <AuthCard title="تأیید ایمیل" lead="نشانی ایمیل حساب شما تأیید می‌شود.">
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthCard>
  );
}
