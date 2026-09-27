import type { Metadata } from 'next';
import { ContentListingPage } from '@/components/content/content-pages';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'مقالات',
  description: 'مقالات و یادداشت‌های تخصصی درباره امکان‌سنجی، تأمین مالی، آموزش و پژوهش.',
  path: '/articles',
});

export default function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ContentListingPage kind="ARTICLE" searchParams={searchParams} />;
}
