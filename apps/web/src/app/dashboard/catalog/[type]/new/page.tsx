'use client';

import { ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CatalogEditor } from '@/components/dashboard/catalog/catalog-editor';
import { CATALOGS, isCatalogType } from '@/components/dashboard/catalog/config';
import { useCan } from '@/components/dashboard/me-context';
import { PageTitle } from '@/components/dashboard/ui';

export default function NewCatalogRecordPage() {
  const { type } = useParams<{ type: string }>();
  const allowed = useCan('catalog:manage');
  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;
  if (!isCatalogType(type)) return <ErrorMessage>این کاتالوگ وجود ندارد.</ErrorMessage>;
  const config = CATALOGS[type];
  return (
    <>
      <PageTitle
        title={`${config.singular} جدید`}
        action={
          <Link href={`/dashboard/catalog/${type}`} className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <CatalogEditor config={config} />
    </>
  );
}
