import { Container } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ServiceRequestForm } from '@/components/forms/service-request-form';
import { PageIntro } from '@/components/layout/page-shell';
import { contact } from '@/content/site';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'تماس با ما',
  description: `نشانی، تلفن و ایمیل رشدآفرینان صنعت و معدن؛ ${contact.address}`,
  path: '/contact',
});

export default function ContactPage() {
  return (
    <>
      <PageIntro
        path="/contact"
        crumb="تماس با ما"
        title="درخواست مشاوره و ارتباط با کارشناسان"
        lead="پیام خود را ثبت کنید؛ کارشناسان برای هماهنگی با شما تماس می‌گیرند."
      />
      <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-10 pt-16 pb-20">
        <div
          data-reveal=""
          className="rounded-tile border border-line bg-brand-700 p-[clamp(20px,3vw,36px)] shadow-form"
        >
          <h2 className="mb-1.5 font-display text-[22px] font-extrabold text-ink">فرم تماس</h2>
          <p className="mb-6 text-sm text-ink-3">فیلدهای ستاره‌دار الزامی است.</p>
          <ServiceRequestForm type="CONTACT" />
        </div>
        <div data-reveal="" data-delay="100" className="flex flex-col gap-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3.5 rounded-card border border-line bg-brand-800 p-6 text-[15px] text-ink">
            <dt className="text-ink-5">نشانی</dt>
            <dd>
              <address className="not-italic">{contact.address}</address>
            </dd>
            <dt className="text-ink-5">کد پستی</dt>
            <dd>{contact.postalCode}</dd>
            <dt className="text-ink-5">تلفن</dt>
            <dd>
              <a href={contact.phoneHref} dir="ltr" className="no-underline">
                {contact.phone}
              </a>
            </dd>
            <dt className="text-ink-5">ایمیل</dt>
            <dd>
              <a href={`mailto:${contact.email}`} dir="ltr" className="no-underline">
                {contact.email}
              </a>
            </dd>
            {contact.social.map((item) => (
              <div key={item.key} className="contents">
                <dt className="text-ink-5">{item.label}</dt>
                <dd>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="no-underline"
                  >
                    @{item.handle}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-ink-3">
            درخواست قبلی ثبت کرده‌اید؟{' '}
            <Link href="/track" className="font-bold">
              پیگیری درخواست
            </Link>
          </p>
        </div>
      </Container>
    </>
  );
}
