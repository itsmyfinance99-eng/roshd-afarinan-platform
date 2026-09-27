import { Accordion, buttonClasses, Container, ordinal, Section } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/layout/page-shell';
import { consultingServices, faq } from '@/content/site';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'مشاوره',
  description: 'مشاوره تخصصی در سرمایه‌گذاری، تأمین مالی، اقتصاد، امکان‌سنجی و مدیریت پروژه.',
  path: '/consulting',
});

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

      <Container className="py-[72px]">
        {consultingServices.map((service, i) => (
          <div
            key={service.key}
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] items-center gap-x-10 gap-y-4 border-b border-line-2 py-8"
          >
            <div className="flex items-baseline gap-[18px]">
              <span className="text-sm font-bold text-primary">{ordinal(i)}</span>
              <h2 className="text-2xl font-extrabold text-brand-900">{service.title}</h2>
            </div>
            <p className="text-base leading-loose text-ink-3">{service.description}</p>
            <Link
              href={`/consulting/request?service=${service.key}`}
              className="justify-self-end text-[15px] font-bold no-underline"
            >
              درخواست این خدمت ‹
            </Link>
          </div>
        ))}
      </Container>

      <Section tone="muted" aria-labelledby="faq-title">
        <div className="mx-auto max-w-[880px] px-6 py-[72px]">
          <h2
            id="faq-title"
            className="mb-6 text-[clamp(24px,2.8vw,32px)] font-extrabold text-brand-900"
          >
            پرسش‌های متداول
          </h2>
          <Accordion items={faq.map((f) => ({ question: f.question, answer: f.answer }))} />
        </div>
      </Section>

      <Container className="py-[72px]">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-panel bg-brand-900 p-[clamp(28px,5vw,56px)]">
          <h2 className="text-[clamp(22px,2.6vw,30px)] font-extrabold text-white">
            برای انتخاب خدمت مناسب با ما گفت‌وگو کنید.
          </h2>
          <Link
            href="/consulting/request"
            className={buttonClasses('inverse', 'lg', 'font-extrabold')}
          >
            درخواست مشاوره
          </Link>
        </div>
      </Container>
    </>
  );
}
