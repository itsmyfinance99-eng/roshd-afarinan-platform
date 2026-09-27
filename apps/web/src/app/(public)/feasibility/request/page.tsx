import { Container } from '@roshd/ui';
import type { Metadata } from 'next';
import { ServiceRequestForm } from '@/components/forms/service-request-form';
import { PageIntro } from '@/components/layout/page-shell';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'درخواست امکان‌سنجی',
  description:
    'اطلاعات اولیه طرح خود را ثبت کنید تا کارشناسان دامنه مطالعه امکان‌سنجی را مشخص کنند.',
  path: '/feasibility/request',
});

export default function FeasibilityRequestPage() {
  return (
    <>
      <PageIntro
        path="/feasibility/request"
        crumb="درخواست امکان‌سنجی"
        parent={{ label: 'امکان‌سنجی', href: '/feasibility' }}
        eyebrow="گام اول"
        title="درخواست امکان‌سنجی"
        lead="اطلاعات اولیه طرح را ثبت کنید. پس از بررسی اولیه، کارشناسان دامنه خدمت و مراحل بعدی را با شما هماهنگ می‌کنند."
      />
      <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-12 py-16">
        <div className="rounded-panel border border-line-2 p-[clamp(20px,3vw,32px)]">
          <ServiceRequestForm type="FEASIBILITY" />
        </div>
        <aside className="flex flex-col gap-4 text-[15px] leading-loose text-ink-3">
          <h2 className="text-lg font-extrabold text-brand-900">چه اطلاعاتی لازم است؟</h2>
          <p>شرح کوتاه ایده، حوزه فعالیت، محل اجرا و مرحله فعلی طرح کافی است.</p>
          <p>مدت زمان مطالعه به دامنه و پیچیدگی طرح بستگی دارد و پس از بررسی اولیه اعلام می‌شود.</p>
          <p>
            پس از ثبت، یک کد پیگیری دریافت می‌کنید که با آن و شماره موبایل خود می‌توانید وضعیت را
            ببینید.
          </p>
        </aside>
      </Container>
    </>
  );
}
