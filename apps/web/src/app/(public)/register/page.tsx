import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterForm } from '@/components/forms/auth-forms';
import { AuthCard } from '@/components/layout/auth-card';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'ثبت‌نام',
  path: '/register',
  noIndex: true,
});

export default function RegisterPage() {
  return (
    <AuthCard
      tab="register"
      title="ایجاد حساب کاربری"
      lead="با یک حساب، درخواست‌های آموزش، امکان‌سنجی، پژوهش و مشاوره را یک‌جا پیگیری کنید."
    >
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
