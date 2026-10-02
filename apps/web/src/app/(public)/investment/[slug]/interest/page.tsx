import type { Metadata } from 'next';
import { RequestCard } from '@/components/content/detail-layout';
import { ServiceRequestForm } from '@/components/forms/service-request-form';
import { PageIntro } from '@/components/layout/page-shell';
import { getInvestment } from '@/lib/investment-api';
import { requireFound } from '@/lib/server-api';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const project = await requireFound(getInvestment((await params).slug));
  return {
    title: `ابراز علاقه: ${project.title}`,
    alternates: { canonical: `/investment/${project.slug}/interest` },
    robots: { index: false, follow: true },
  };
}

/** Expression of interest (a service request); no investment transaction happens here. */
export default async function InvestmentInterestPage({ params }: { params: Params }) {
  const project = await requireFound(getInvestment((await params).slug));
  return (
    <>
      <PageIntro
        path={`/investment/${project.slug}/interest`}
        crumb="ابراز علاقه"
        parent={{ label: project.title, href: `/investment/${project.slug}` }}
        title={`ابراز علاقه به «${project.title}»`}
        lead="مشخصات تماس و نوع علاقه‌مندی خود را بنویسید؛ کارشناسان برای ارائه اطلاعات بیشتر با شما تماس می‌گیرند."
      />
      <RequestCard>
        <ServiceRequestForm type="INVESTMENT" reference={project.slug} />
      </RequestCard>
    </>
  );
}
