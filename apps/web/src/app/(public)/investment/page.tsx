import { Container, Notice } from '@roshd/ui';
import type { Metadata } from 'next';
import { PageIntro } from '@/components/layout/page-shell';
import { InvestmentCatalog } from '@/components/sections/catalogs';
import { demoProjects, sectors } from '@/content/demo';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'فرصت‌های سرمایه‌گذاری',
  description: 'معرفی پروژه‌ها و طرح‌ها؛ بدون هیچ تراکنش سرمایه‌گذاری آنلاین.',
  path: '/investment',
});

export default function InvestmentPage() {
  return (
    <>
      <PageIntro
        path="/investment"
        crumb="فرصت‌های سرمایه‌گذاری"
        title="معرفی پروژه‌ها و طرح‌ها"
        lead="در این نسخه، همه پروژه‌ها نمونه نمایشی هستند تا ساختار نمایش و فیلتر فرصت‌ها بررسی شود."
      />
      <Container className="pt-12 pb-20">
        <Notice className="mb-7">
          هیچ‌یک از موارد زیر فرصت واقعی یا باز سرمایه‌گذاری نیست. اطلاعات بازده یا عملکرد مالی
          نمایش داده نمی‌شود و این بخش امکان هیچ تراکنشی ندارد.
        </Notice>
        <InvestmentCatalog projects={demoProjects} sectors={sectors} />
      </Container>
    </>
  );
}
