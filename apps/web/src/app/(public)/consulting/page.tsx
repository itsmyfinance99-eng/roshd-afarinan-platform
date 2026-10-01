import { toPersianDigits } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CopperCta, FaqSection } from '@/components/content/page-blocks';
import { PageIntro } from '@/components/layout/page-shell';
import { consultingServices } from '@/content/site';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'مشاوره',
  description: 'مشاوره تخصصی در سرمایه‌گذاری، تأمین مالی، اقتصاد، امکان‌سنجی و مدیریت پروژه.',
  path: '/consulting',
});

/** Consulting services (design Services.dc.html). */
export default function ConsultingPage() {
  return (
    <>
      <PageIntro
        path="/consulting"
        crumb="مشاوره"
        eyebrow="خدمات مشاوره"
        title="مشاوره تخصصی در سرمایه‌گذاری، تأمین مالی، اقتصاد و پروژه"
        lead="همراهی کارشناسی از مرحله ایده تا تصمیم سرمایه‌گذاری."
      />

      <section
        aria-label="خدمات مشاوره"
        data-stagger="60"
        className="mx-auto max-w-(--container-page) px-6 py-[72px]"
      >
        {consultingServices.map((service, i) => (
          <div
            key={service.key}
            data-reveal=""
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] items-center gap-x-10 gap-y-4 border-b border-line py-8"
          >
            <div className="flex items-baseline gap-[18px]">
              <span className="text-sm font-bold text-primary">{toPersianDigits(i + 1)}</span>
              <h2 className="font-display text-2xl font-extrabold text-ink">{service.title}</h2>
            </div>
            <p className="text-base leading-loose text-ink-3">{service.description}</p>
            <Link
              href={`/consulting/request?service=${service.key}`}
              aria-label={`درخواست این خدمت: ${service.title}`}
              className="justify-self-end text-[15px] font-bold text-accent no-underline hover:text-ink"
            >
              درخواست این خدمت ‹
            </Link>
          </div>
        ))}
      </section>

      <FaqSection raised />
      <CopperCta
        title="برای انتخاب خدمت مناسب با ما گفت‌وگو کنید."
        href="/consulting/request"
        label="درخواست مشاوره"
      />
    </>
  );
}
