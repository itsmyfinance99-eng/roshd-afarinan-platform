import { Accordion, toPersianDigits } from '@roshd/ui';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { FeasibilityRequest } from '@/components/forms/feasibility-request';
import { PageIntro } from '@/components/layout/page-shell';
import { faq } from '@/content/site';
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

/** Feasibility (design Feasibility.dc.html): scope cards, paper request wizard, FAQ. */
export default function FeasibilityPage() {
  return (
    <>
      <PageIntro
        path="/feasibility"
        crumb="امکان‌سنجی"
        title="از ایده اولیه تا مطالعات امکان‌سنجی و طرح توجیهی"
        lead="ارزیابی فنی، بازار و مالی طرح پیش از ورود به اجرا، با همراهی کارشناسان در هر مرحله."
      />

      <section aria-labelledby="deliver" className="mx-auto max-w-(--container-page) px-6 py-20">
        <h2
          id="deliver"
          data-reveal=""
          className="mb-7 font-display text-[clamp(26px,3vw,36px)] font-extrabold text-ink"
        >
          دامنه مطالعات
        </h2>
        <div
          data-stagger="70"
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4"
        >
          {scopes.map((scope, i) => (
            <div
              key={scope.title}
              data-reveal=""
              data-spotlight=""
              className="relative flex flex-col gap-2.5 overflow-hidden rounded-panel border border-line bg-brand-700 p-7 transition-[transform,border-color,box-shadow] duration-200 ease-enter hover:-translate-y-[3px] hover:border-primary hover:shadow-[0_20px_44px_-28px_color-mix(in_srgb,var(--color-primary)_50%,transparent)]"
            >
              <span
                data-spot=""
                aria-hidden="true"
                className="spot"
                style={{ '--spot-size': '300px' } as CSSProperties}
              />
              <span className="relative text-sm font-bold text-accent">
                {toPersianDigits(i + 1)}
              </span>
              <h3 className="relative font-display text-xl font-extrabold text-ink">
                {scope.title}
              </h3>
              <p className="relative text-[14.5px] leading-[1.95] text-ink-3">
                {scope.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="request"
        aria-labelledby="req-title"
        data-surface="paper"
        className="relative scroll-mt-24 overflow-hidden border-y border-paper-line"
      >
        <div
          aria-hidden="true"
          className="dots absolute inset-0 [--dot-color:var(--color-paper-line)] [mask-image:radial-gradient(ellipse_45%_60%_at_90%_10%,#000,transparent_70%)]"
        />
        <div className="relative mx-auto max-w-(--container-page) px-6 py-[88px]">
          <FeasibilityRequest />
        </div>
      </section>

      <section aria-labelledby="faq-title">
        <div className="mx-auto max-w-[880px] px-6 py-[88px]">
          <h2
            id="faq-title"
            data-reveal=""
            className="mb-6 font-display text-[clamp(26px,3vw,36px)] font-extrabold text-ink"
          >
            پرسش‌های متداول
          </h2>
          <Accordion items={faq.map((f) => ({ question: f.question, answer: f.answer }))} />
        </div>
      </section>
    </>
  );
}
