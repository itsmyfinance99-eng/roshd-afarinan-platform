import { redirect } from 'next/navigation';

/** The catalog section opens on courses; tabs switch between catalogs. */
export default function CatalogIndexPage() {
  redirect('/dashboard/catalog/courses');
}
