import type { Metadata } from 'next';
import { RequestCard } from '@/components/content/detail-layout';
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
      <RequestCard>
        <ServiceRequestForm
          type="CONSULTING"
          defaultService={typeof service === 'string' ? service : undefined}
        />
      </RequestCard>
    </>
  );
}
