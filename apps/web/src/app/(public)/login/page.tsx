import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/forms/auth-forms';
import { AuthCard } from '@/components/layout/auth-card';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({ title: 'ورود', path: '/login', noIndex: true });

export default function LoginPage() {
  return (
    <AuthCard title="ورود به حساب" lead="برای پیگیری درخواست‌ها و دسترسی به داشبورد وارد شوید.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
