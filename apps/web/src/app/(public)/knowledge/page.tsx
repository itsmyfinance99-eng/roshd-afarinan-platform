import type { Metadata } from 'next';
import { ContentListingPage } from '@/components/content/content-pages';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'دانشنامه',
  description: 'مفاهیم کلیدی سرمایه‌گذاری، امکان‌سنجی و تأمین مالی.',
  path: '/knowledge',
});

export default function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ContentListingPage kind="KNOWLEDGE" searchParams={searchParams} />;
}
