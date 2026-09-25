import { Accordion, buttonClasses, Container, ordinal, Section, SectionHeader } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/layout/page-shell';
import { ProcessSteps } from '@/components/sections/process-steps';
import { faq, processSteps } from '@/content/site';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'امکان‌سنجی',
  description: 'ارزیابی فنی، بازار و مالی طرح پیش از ورود به اجرا؛ از ایده اولیه تا طرح توجیهی.',
  path: '/feasibility',
});

const scopes = [
  { title: 'مطالعه بازار', description: 'بررسی عرضه، تقاضا و شرایط رقابتی محصول یا خدمت.' },
  { title: 'مطالعه فنی', description: 'ارزیابی فناوری، ظرفیت، محل و نیازهای اجرایی.' },
  { title: 'مطالعه مالی', description: 'برآورد هزینه‌ها و شاخص‌های ارزیابی طرح.' },
  { title: 'طرح توجیهی', description: 'جمع‌بندی مطالعات در قالب طرح توجیهی.' },
];

export default function FeasibilityPage() {
  return (
    <>
      <PageIntro
        path="/feasibility"
        crumb="امکان‌سنجی"
        title="از ایده اولیه تا مطالعات امکان‌سنجی و طرح توجیهی"
        lead="ارزیابی فنی، بازار و مالی طرح پیش از ورود به اجرا، با همراهی کارشناسان در هر مرحله."
      />

      <Container className="py-[72px]">
        <section aria-labelledby="scope-title">
          <h2
            id="scope-title"
            className="mb-7 text-[clamp(24px,2.8vw,32px)] font-extrabold text-brand-900"
          >
            دامنه مطالعات
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-px overflow-hidden rounded-card border border-line-2 bg-line-2">
            {scopes.map((scope, i) => (
              <div key={scope.title} className="flex flex-col gap-2.5 bg-white p-7">
                <span className="text-[13px] text-ink-5">{ordinal(i)}</span>
                <h3 className="text-[19px] font-extrabold text-brand-900">{scope.title}</h3>
                <p className="text-sm leading-[1.9] text-ink-4">{scope.description}</p>
              </div>
            ))}
          </div>
        </section>
      </Container>

      <Section tone="dark" aria-labelledby="flow-title">
        <Container className="py-16">
          <SectionHeader id="flow-title" title="فرایند انجام کار" tone="dark" className="mb-9" />
          <ProcessSteps steps={processSteps} />
        </Container>
      </Section>

      <Container className="py-[72px]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-8 rounded-panel border border-line-2 bg-surface p-[clamp(28px,5vw,56px)]">
          <div>
            <p className="mb-2.5 text-sm font-bold text-primary">گام اول</p>
            <h2 className="mb-3 text-[clamp(24px,2.8vw,32px)] font-extrabold text-brand-900">
              درخواست امکان‌سنجی
            </h2>
            <p className="text-[15px] leading-loose text-ink-3">
              اطلاعات اولیه طرح را ثبت کنید. کارشناسان پس از بررسی اولیه، دامنه خدمت را مشخص
              می‌کنند.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Link href="/feasibility/request" className={buttonClasses('primary', 'lg')}>
              ثبت درخواست امکان‌سنجی
            </Link>
            <Link href="/track" className={buttonClasses('secondary', 'lg')}>
              پیگیری درخواست
            </Link>
          </div>
        </div>
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
    </>
  );
}
