import { Container } from '@roshd/ui';
import type { Metadata } from 'next';
import { TrackRequestForm } from '@/components/forms/track-request-form';
import { PageIntro } from '@/components/layout/page-shell';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'پیگیری درخواست',
  description: 'وضعیت درخواست خود را با کد پیگیری و شماره موبایل ببینید.',
  path: '/track',
  noIndex: true,
});

export default function TrackPage() {
  return (
    <>
      <PageIntro
        path="/track"
        crumb="پیگیری درخواست"
        title="پیگیری درخواست"
        lead="کد پیگیری که پس از ثبت درخواست دریافت کرده‌اید و شماره موبایل ثبت‌شده را وارد کنید."
      />
      <Container className="max-w-3xl py-16">
        <TrackRequestForm />
      </Container>
    </>
  );
}
