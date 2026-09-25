import { Container } from '@roshd/ui';
import type { Metadata } from 'next';
import { ServiceRequestForm } from '@/components/forms/service-request-form';
import { PageIntro } from '@/components/layout/page-shell';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'درخواست مشاوره',
  description: 'ثبت درخواست مشاوره تخصصی؛ کارشناسان برای هماهنگی با شما تماس می‌گیرند.',
  path: '/consulting/request',
});

export default async function ConsultingRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const { service } = await searchParams;
  return (
    <>
      <PageIntro
        path="/consulting/request"
        crumb="درخواست مشاوره"
        parent={{ label: 'مشاوره', href: '/consulting' }}
        title="درخواست مشاوره"
        lead="نیاز خود را شرح دهید؛ کارشناس مرتبط برای هماهنگی جلسه با شما تماس می‌گیرد."
      />
      <Container className="max-w-3xl py-16">
        <div className="rounded-panel border border-line-2 p-[clamp(20px,3vw,32px)]">
          <ServiceRequestForm
            type="CONSULTING"
            defaultService={typeof service === 'string' ? service : undefined}
          />
        </div>
      </Container>
    </>
  );
}
