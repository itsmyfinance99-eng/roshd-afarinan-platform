'use client';

import { ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CatalogEditor, type CatalogRecord } from '@/components/dashboard/catalog/catalog-editor';
import { CATALOGS, isCatalogType } from '@/components/dashboard/catalog/config';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

export default function EditCatalogRecordPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const allowed = useCan('catalog:manage');
  const config = isCatalogType(type) ? CATALOGS[type] : null;
  const { state, reload } = useApi<CatalogRecord>(
    allowed && config ? `${config.apiBase}/${encodeURIComponent(id)}` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;
  if (!config) return <ErrorMessage>این کاتالوگ وجود ندارد.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title={`ویرایش ${config.singular}`}
        action={
          <Link href={`/dashboard/catalog/${config.type}`} className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(record) => (
          <CatalogEditor
            key={record.id}
            config={config}
            record={record}
            onSaved={() => reload({ silent: true })}
          />
        )}
      </AsyncBoundary>
    </>
  );
}
