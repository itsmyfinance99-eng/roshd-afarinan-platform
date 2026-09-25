'use client';

import { ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentEditor, type EditableEntry } from '@/components/dashboard/content-editor';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

export default function EditContentPage() {
  const { id } = useParams<{ id: string }>();
  const allowed = useCan('cms:write');
  const { state, reload } = useApi<EditableEntry>(
    allowed ? `/cms/entries/${encodeURIComponent(id)}` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="ویرایش محتوا"
        action={
          <Link href="/dashboard/content" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(entry) => (
          <ContentEditor
            key={`${entry.id}-${entry.status}`}
            entry={entry}
            onSaved={() => reload({ silent: true })}
          />
        )}
      </AsyncBoundary>
    </>
  );
}
