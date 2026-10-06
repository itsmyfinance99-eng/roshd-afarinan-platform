'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageTitle } from '@/components/dashboard/ui';
import { ProjectForm } from '@/components/feasibility/parts';
import { apiFetch } from '@/lib/api-client';

export default function NewFeasibilityProjectPage() {
  const router = useRouter();

  return (
    <>
      <PageTitle
        title="پروژه امکان‌سنجی جدید"
        action={
          <Link href="/dashboard/feasibility" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <p className="mb-6 max-w-2xl text-[15px] leading-loose text-ink-3">
        پروژه به‌صورت پیش‌نویس ذخیره می‌شود و بررسی آن پس از ارسال شما آغاز می‌شود.
      </p>
      <ProjectForm
        initial={{ title: '', sector: '', location: '', summary: '' }}
        submitLabel="ذخیره پیش‌نویس"
        busyLabel="در حال ذخیره…"
        onSubmit={async (values) => {
          const result = await apiFetch<{ id: string }>('/feasibility-projects', {
            method: 'POST',
            body: values,
          });
          if (!result.ok) return result;
          router.replace(`/dashboard/feasibility/${result.data.id}`);
          return { ok: true };
        }}
      />
    </>
  );
}
