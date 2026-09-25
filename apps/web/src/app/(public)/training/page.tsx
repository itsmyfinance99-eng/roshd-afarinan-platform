import { Container, Notice } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/layout/page-shell';
import { TrainingCatalog } from '@/components/sections/catalogs';
import { demoCourses } from '@/content/demo';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'آموزش',
  description: 'آموزش تخصصی سرمایه‌گذاری، اقتصاد، امکان‌سنجی و تأمین مالی.',
  path: '/training',
});

export default function TrainingPage() {
  return (
    <>
      <PageIntro
        path="/training"
        crumb="آموزش"
        title="آموزش تخصصی سرمایه‌گذاری، اقتصاد، امکان‌سنجی و تأمین مالی"
        lead="دوره‌ها و کارگاه‌های تخصصی برای مدیران، کارآفرینان و کارشناسان."
      />
      <Container className="pt-12 pb-20">
        <Notice className="mb-7">
          دوره‌های این صفحه نمونه نمایشی هستند و برای بررسی ساختار کاتالوگ آموزشی قرار گرفته‌اند.
          برای اطلاع از دوره‌های واقعی{' '}
          <Link href="/contact" className="font-bold">
            با ما تماس بگیرید
          </Link>
          .
        </Notice>
        <TrainingCatalog courses={demoCourses} />
      </Container>
    </>
  );
}
