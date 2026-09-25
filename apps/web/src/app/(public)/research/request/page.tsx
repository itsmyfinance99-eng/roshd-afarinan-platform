import { Container } from '@roshd/ui';
import type { Metadata } from 'next';
import { ServiceRequestForm } from '@/components/forms/service-request-form';
import { PageIntro } from '@/components/layout/page-shell';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'ثبت سفارش پژوهش',
  description: 'موضوع و نیاز پژوهشی خود را ثبت کنید تا کارشناسان دامنه مطالعه را پیشنهاد دهند.',
  path: '/research/request',
});

export default function ResearchRequestPage() {
  return (
    <>
      <PageIntro
        path="/research/request"
        crumb="ثبت سفارش پژوهش"
        parent={{ label: 'پژوهش', href: '/research' }}
        title="ثبت سفارش پژوهش"
        lead="موضوع و هدف مطالعه را بنویسید؛ کارشناسان پس از بررسی، دامنه و روش پژوهش را پیشنهاد می‌دهند."
      />
      <Container className="max-w-3xl py-16">
        <div className="rounded-panel border border-line-2 p-[clamp(20px,3vw,32px)]">
          <ServiceRequestForm type="RESEARCH" />
        </div>
      </Container>
    </>
  );
}
