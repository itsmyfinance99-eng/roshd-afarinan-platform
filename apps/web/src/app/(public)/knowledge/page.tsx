import { Notice } from '@roshd/ui';
import type { Metadata } from 'next';
import { PageIntro } from '@/components/layout/page-shell';
import { KnowledgeCatalog } from '@/components/sections/catalogs';
import { demoKnowledge } from '@/content/demo';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'دانشنامه',
  description: 'مفاهیم کلیدی سرمایه‌گذاری، امکان‌سنجی و تأمین مالی.',
  path: '/knowledge',
});

export default function KnowledgePage() {
  return (
    <>
      <PageIntro
        path="/knowledge"
        crumb="دانشنامه"
        title="مفاهیم کلیدی سرمایه‌گذاری، امکان‌سنجی و تأمین مالی"
        lead="مدخل‌های کوتاه و قابل‌جستجو برای آشنایی با اصطلاحات تخصصی."
      />
      <div className="mx-auto max-w-[960px] px-6 pt-12 pb-20">
        <Notice className="mb-7">
          مدخل‌های فعلی نمونه نمایشی هستند و پس از انتشار محتوای تأییدشده کامل می‌شوند.
        </Notice>
        <KnowledgeCatalog items={demoKnowledge} />
      </div>
    </>
  );
}
