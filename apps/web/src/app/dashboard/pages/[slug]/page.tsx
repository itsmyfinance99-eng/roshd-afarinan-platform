'use client';

import { ErrorMessage } from '@roshd/ui';
import type { PageSection } from '@roshd/validation';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCan } from '@/components/dashboard/me-context';
import { PageEditor, type EditablePage } from '@/components/dashboard/page-editor';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { DEFAULT_PAGES, EDITABLE_PAGES } from '@/content/pages';
import { useApi } from '@/lib/use-api';

export default function EditInstitutionalPage() {
  const { slug } = useParams<{ slug: string }>();
  const allowed = useCan('cms:write');
  const known = EDITABLE_PAGES.find((p) => p.slug === slug);
  const { state, reload } = useApi<EditablePage>(
    allowed && known ? `/cms/pages/${encodeURIComponent(slug)}` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;
  if (!known) return <ErrorMessage>این صفحه قابل ویرایش نیست.</ErrorMessage>;

  const defaults = DEFAULT_PAGES[known.slug];
  const header = (
    <PageTitle
      title={`ویرایش صفحه «${known.label}»`}
      action={
        <Link href="/dashboard/pages" className="text-sm no-underline">
          بازگشت به فهرست ‹
        </Link>
      }
    />
  );

  // A page that was never saved starts from the content layer defaults.
  if (state.status === 'error' && state.httpStatus === 404) {
    return (
      <>
        {header}
        <PageEditor
          slug={known.slug}
          publicPath={known.path}
          fromDefaults
          page={{
            slug: known.slug,
            title: defaults.title,
            sections: defaults.sections as PageSection[],
            status: 'DRAFT',
            metaTitle: null,
            metaDescription: defaults.metaDescription,
            noIndex: false,
          }}
          onSaved={() => reload({ silent: true })}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <AsyncBoundary state={state} reload={reload}>
        {(page) => (
          <PageEditor
            key={page.slug}
            slug={known.slug}
            publicPath={known.path}
            fromDefaults={false}
            page={page}
            onSaved={() => reload({ silent: true })}
          />
        )}
      </AsyncBoundary>
    </>
  );
}
