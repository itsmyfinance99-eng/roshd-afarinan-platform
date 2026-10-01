import type { Metadata } from 'next';
import { CopperCta } from '@/components/content/page-blocks';
import { JourneysBento } from '@/components/home/bento';
import { ProcessRail, ServicesPaper } from '@/components/home/sections';
import { PageIntro } from '@/components/layout/page-shell';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'خدمات',
  description: 'آموزش، امکان‌سنجی، پژوهش، مشاوره و معرفی پروژه‌ها در مسیر سرمایه‌گذاری.',
  path: '/services',
});

/** Services overview (not drawn in the handoff): built from the home v2 sections. */
export default function ServicesPage() {
  return (
    <>
      <PageIntro
        path="/services"
        crumb="خدمات"
        title="خدمات رشدآفرینان در مسیر ایده تا سرمایه‌گذاری"
        lead="از آموزش و پژوهش تا امکان‌سنجی، مشاوره و معرفی پروژه‌ها؛ هر مسیر با همراهی کارشناسان."
      />
      <JourneysBento />
      <ServicesPaper />
      <ProcessRail />
      <CopperCta
        title="برای انتخاب خدمت مناسب با ما گفت‌وگو کنید."
        href="/contact"
        label="گفت‌وگو با کارشناسان"
      />
    </>
  );
}
