import type { Metadata } from 'next';
import { FeasibilityRequest } from '@/components/forms/feasibility-request';
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
      <section
        aria-labelledby="req-title"
        data-surface="paper"
        className="relative overflow-hidden border-b border-paper-line"
      >
        <div
          aria-hidden="true"
          className="dots absolute inset-0 [--dot-color:var(--color-paper-line)] [mask-image:radial-gradient(ellipse_45%_60%_at_90%_10%,#000,transparent_70%)]"
        />
        <div className="relative mx-auto max-w-(--container-page) px-6 py-[88px]">
          <FeasibilityRequest heading="اطلاعات طرح در سه مرحله" />
        </div>
      </section>
    </>
  );
}
