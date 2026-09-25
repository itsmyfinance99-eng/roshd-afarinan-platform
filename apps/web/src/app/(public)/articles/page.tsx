import { Container, Notice } from '@roshd/ui';
import type { Metadata } from 'next';
import { PageIntro } from '@/components/layout/page-shell';
import { EntryCatalog } from '@/components/sections/catalogs';
import { demoArticles } from '@/content/demo';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'مقالات',
  description: 'مقالات و یادداشت‌های تخصصی درباره امکان‌سنجی، تأمین مالی، آموزش و پژوهش.',
  path: '/articles',
});

export default function ArticlesPage() {
  return (
    <>
      <PageIntro path="/articles" crumb="مقالات" title="مقالات و یادداشت‌های تخصصی" />
      <Container className="pt-12 pb-20">
        <Notice className="mb-7">مقالات فعلی نمونه نمایشی هستند.</Notice>
        <EntryCatalog items={demoArticles} label="دسته مقالات" withImage />
      </Container>
    </>
  );
}
