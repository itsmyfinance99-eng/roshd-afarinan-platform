import { buttonClasses, Container, ordinal, Section, SectionHeader } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/layout/page-shell';
import { ProcessSteps } from '@/components/sections/process-steps';
import { consultingServices, journeys, processSteps } from '@/content/site';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'خدمات',
  description: 'آموزش، امکان‌سنجی، پژوهش، مشاوره و معرفی پروژه‌ها در مسیر سرمایه‌گذاری.',
  path: '/services',
});

export default function ServicesPage() {
  return (
    <>
      <PageIntro
        path="/services"
        crumb="خدمات"
        title="خدمات رشدآفرینان در مسیر ایده تا سرمایه‌گذاری"
        lead="از آموزش و پژوهش تا امکان‌سنجی، مشاوره و معرفی پروژه‌ها؛ هر مسیر با همراهی کارشناسان."
      />

      <Container className="py-[72px]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-5">
          {journeys.map((journey, i) => (
            <Link
              key={journey.key}
              href={journey.href}
              className="flex flex-col gap-3 rounded-card border border-t-4 border-line-2 border-t-primary bg-white p-7 text-ink no-underline hover:border-primary hover:bg-surface-hover hover:text-ink"
            >
              <span className="text-sm font-bold text-primary">{ordinal(i)}</span>
              <span className="text-2xl font-black text-brand-900">{journey.title}</span>
              <span className="text-[15px] leading-loose text-ink-3">{journey.description}</span>
            </Link>
          ))}
        </div>
      </Container>

      <Section tone="muted" aria-labelledby="consulting-title">
        <Container className="py-[72px]">
          <SectionHeader
            id="consulting-title"
            eyebrow="مشاوره"
            title="خدمات مشاوره تخصصی"
            action={
              <Link href="/consulting" className="text-[15px] font-bold text-primary no-underline">
                جزئیات مشاوره ‹
              </Link>
            }
          />
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3">
            {consultingServices.map((service) => (
              <li key={service.key} className="rounded-card bg-white p-5">
                <h3 className="mb-1.5 text-lg font-extrabold text-brand-900">{service.title}</h3>
                <p className="text-sm leading-[1.9] text-ink-4">{service.description}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section tone="dark" aria-labelledby="process-title">
        <Container className="py-16">
          <SectionHeader
            id="process-title"
            title="فرایند انجام کار"
            tone="dark"
            className="mb-10"
          />
          <ProcessSteps steps={processSteps} />
          <Link
            href="/contact"
            className={buttonClasses('inverse', 'md', 'mt-10 h-[50px] px-6 font-extrabold')}
          >
            گفت‌وگو با کارشناسان
          </Link>
        </Container>
      </Section>
    </>
  );
}
