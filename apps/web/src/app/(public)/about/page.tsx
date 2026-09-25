import { Container, ordinal, Section } from '@roshd/ui';
import type { Metadata } from 'next';
import { PageIntro } from '@/components/layout/page-shell';
import {
  activityAreas,
  contact,
  credentials,
  expertise,
  pastWorkSectors,
  site,
  stats,
} from '@/content/site';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'درباره ما',
  description: site.about,
  path: '/about',
});

export default function AboutPage() {
  return (
    <>
      <PageIntro path="/about" crumb="درباره ما" title={site.legalName} lead={site.about} />

      <Container className="py-[72px]">
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] border-t-2 border-brand-900">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-2 border-b border-line py-7 pe-6">
              <dt className="order-2 text-[17px] font-bold">{stat.label}</dt>
              <dd className="order-1 text-5xl leading-tight font-black text-primary">
                {stat.value}
              </dd>
              <dd className="order-3 text-sm leading-[1.9] text-ink-4">{stat.detail}</dd>
            </div>
          ))}
        </dl>
      </Container>

      <Section tone="muted" aria-labelledby="areas">
        <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-12 py-[72px]">
          <div>
            <h2
              id="areas"
              className="mb-5 text-[clamp(24px,2.8vw,32px)] font-extrabold text-brand-900"
            >
              حوزه‌های اصلی فعالیت
            </h2>
            <ul className="border-t border-line-3">
              {activityAreas.map((area, i) => (
                <li
                  key={area}
                  className="flex items-baseline gap-4 border-b border-line-3 py-[18px]"
                >
                  <span className="text-[13px] text-ink-5">{ordinal(i)}</span>
                  <span className="text-xl font-extrabold">{area}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-5 text-[clamp(24px,2.8vw,32px)] font-extrabold text-brand-900">
              تخصص‌های تیم
            </h2>
            <ul className="flex flex-wrap gap-2">
              {expertise.map((item) => (
                <li
                  key={item}
                  className="rounded-chip border border-line-3 bg-white px-4 py-2.5 text-[15px]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      <Container className="py-[72px]">
        <section aria-labelledby="experience">
          <h2
            id="experience"
            className="mb-3 text-[clamp(22px,2.4vw,28px)] font-extrabold text-brand-900"
          >
            سوابق مطالعاتی و مشاوره‌ای
          </h2>
          <p className="mb-6 max-w-3xl text-[15px] leading-loose text-ink-4">
            نمونه‌کارهای امکان‌سنجی و مشاوره شرکت در حوزه‌های زیر انجام شده است:
          </p>
          <ul className="flex flex-wrap gap-2">
            {pastWorkSectors.map((sector) => (
              <li key={sector} className="rounded-chip bg-surface px-3.5 py-2 text-sm text-ink-2">
                {sector}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="credentials" className="mt-16">
          <h2
            id="credentials"
            className="mb-5 text-[clamp(22px,2.4vw,28px)] font-extrabold text-brand-900"
          >
            مجوزها و عضویت‌ها
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3">
            {credentials.map((item) => (
              <li
                key={item}
                className="rounded-card border border-dashed border-line-strong p-4 text-[15px] text-ink-2"
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-ink-5">
            تصویر مدارک و جزئیات هر مجوز پس از دریافت نسخه رسمی و تأیید آن منتشر می‌شود.
          </p>
        </section>

        <section aria-labelledby="office" className="mt-16">
          <h2
            id="office"
            className="mb-4 text-[clamp(22px,2.4vw,28px)] font-extrabold text-brand-900"
          >
            دفتر مرکزی
          </h2>
          <address className="text-[15px] leading-loose text-ink-3 not-italic">
            {contact.address} · کد پستی {contact.postalCode}
          </address>
        </section>
      </Container>
    </>
  );
}
