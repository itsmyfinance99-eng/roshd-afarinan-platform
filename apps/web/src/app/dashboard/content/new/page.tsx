'use client';

import { ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { ContentEditor } from '@/components/dashboard/content-editor';
import { useCan } from '@/components/dashboard/me-context';
import { PageTitle } from '@/components/dashboard/ui';

export default function NewContentPage() {
  if (!useCan('cms:write')) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;
  return (
    <>
      <PageTitle
        title="محتوای جدید"
        action={
          <Link href="/dashboard/content" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <ContentEditor />
    </>
  );
}
