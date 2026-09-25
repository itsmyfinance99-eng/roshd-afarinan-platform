import { buttonClasses, Container, Notice } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/layout/page-shell';
import { EntryCatalog } from '@/components/sections/catalogs';
import { demoResearch } from '@/content/demo';
import { pastWorkSectors } from '@/content/site';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'پژوهش',
  description: 'مطالعات اقتصادی، صنعتی، مالی و توسعه‌ای و ثبت سفارش پژوهش اختصاصی.',
  path: '/research',
});

export default function ResearchPage() {
  return (
    <>
      <PageIntro
        path="/research"
        crumb="پژوهش"
        title="مطالعات اقتصادی، صنعتی، مالی و توسعه‌ای"
        lead="پژوهش‌های کاربردی برای سازمان‌ها، طرح‌ها و سیاست‌گذاری."
      />
      <Container className="pt-12 pb-20">
        <Notice className="mb-7">
          عناوین پژوهشی این صفحه نمونه نمایشی هستند و پس از انتشار گزارش‌های تأییدشده جایگزین
          می‌شوند.
        </Notice>
        <EntryCatalog items={demoResearch} label="حوزه پژوهش" />

        <section aria-labelledby="fields-title" className="mt-14">
          <h2 id="fields-title" className="mb-4 text-xl font-extrabold text-brand-900">
            حوزه‌های سوابق مطالعاتی
          </h2>
          <ul className="flex flex-wrap gap-2">
            {pastWorkSectors.map((sector) => (
              <li key={sector} className="rounded-chip bg-surface px-3.5 py-2 text-sm text-ink-2">
                {sector}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-card border border-line-2 bg-surface p-7">
          <p className="text-[17px] font-bold text-brand-900">نیاز به مطالعه اختصاصی دارید؟</p>
          <Link href="/research/request" className={buttonClasses('primary', 'md', 'h-12')}>
            ثبت سفارش پژوهش
          </Link>
        </div>
      </Container>
    </>
  );
}
