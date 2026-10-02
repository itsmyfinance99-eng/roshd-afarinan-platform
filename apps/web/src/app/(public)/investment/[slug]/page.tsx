import { buttonClasses, DemoBadge, formatRials, Notice, Shine } from '@roshd/ui';
import { INVESTMENT_SECTOR_LABELS_FA, PROJECT_STAGE_LABELS_FA } from '@roshd/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DetailLayout, FactList } from '@/components/content/detail-layout';
import { MarkdownBody } from '@/components/content/markdown';
import { PageIntro } from '@/components/layout/page-shell';
import { site } from '@/content/site';
import { getInvestment } from '@/lib/investment-api';
import { requireFound } from '@/lib/server-api';

export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const project = await requireFound(getInvestment((await params).slug));
  const path = `/investment/${project.slug}`;
  const title = project.metaTitle ?? project.title;
  const description = project.metaDescription ?? project.summary;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: project.noIndex || project.isDemo ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      locale: 'fa_IR',
      siteName: site.name,
      url: path,
      title,
      description,
    },
  };
}

export default async function InvestmentOpportunityPage({ params }: { params: Params }) {
  const project = await requireFound(getInvestment((await params).slug));
  const path = `/investment/${project.slug}`;
  const facts: [string, string][] = [
    ['حوزه', INVESTMENT_SECTOR_LABELS_FA[project.sector]],
    ['مرحله', PROJECT_STAGE_LABELS_FA[project.stage]],
  ];
  if (project.province) facts.push(['موقعیت', project.province]);
  if (project.serviceNeeded) facts.push(['خدمت مورد نیاز', project.serviceNeeded]);
  if (project.estimatedInvestmentRials) {
    facts.push(['برآورد سرمایه‌گذاری', formatRials(project.estimatedInvestmentRials)]);
  }

  return (
    <>
      <PageIntro
        path={path}
        crumb={project.title}
        parent={{ label: 'فرصت‌های سرمایه‌گذاری', href: '/investment' }}
        eyebrow={INVESTMENT_SECTOR_LABELS_FA[project.sector]}
        title={project.title}
        lead={project.summary}
      />
      <DetailLayout
        asideLabel="مشخصات طرح"
        aside={
          <>
            <FactList facts={facts} />
            <Link href={`${path}/interest`} className={buttonClasses('cta', 'xl')}>
              <Shine />
              <span className="relative">ابراز علاقه و دریافت اطلاعات</span>
            </Link>
            <Notice>
              معرفی این طرح پیشنهاد سرمایه‌گذاری یا تضمین بازده نیست و هیچ تراکنشی در این سامانه
              انجام نمی‌شود.
            </Notice>
          </>
        }
      >
        {project.isDemo ? <DemoBadge className="self-start" /> : null}
        <div data-reveal="">
          <MarkdownBody source={project.description} />
        </div>
      </DetailLayout>
    </>
  );
}
