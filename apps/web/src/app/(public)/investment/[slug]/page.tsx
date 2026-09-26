import { buttonClasses, Container, DemoBadge, formatRials, Notice } from '@roshd/ui';
import { INVESTMENT_SECTOR_LABELS_FA, PROJECT_STAGE_LABELS_FA } from '@roshd/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
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
      <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-10 py-12">
        <div className="min-w-0 md:col-span-2">
          {project.isDemo ? <DemoBadge className="mb-6" /> : null}
          <MarkdownBody source={project.description} />
        </div>
        <aside
          aria-label="مشخصات طرح"
          className="flex flex-col gap-5 rounded-card border border-line-2 p-6"
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-[15px]">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ink-5">{label}</dt>
                <dd className="font-semibold text-ink-2">{value}</dd>
              </div>
            ))}
          </dl>
          <Link
            href={`${path}/interest`}
            className={buttonClasses('primary', 'lg', 'no-underline')}
          >
            ابراز علاقه و دریافت اطلاعات
          </Link>
          <Notice>
            معرفی این طرح پیشنهاد سرمایه‌گذاری یا تضمین بازده نیست و هیچ تراکنشی در این سامانه انجام
            نمی‌شود.
          </Notice>
        </aside>
      </Container>
    </>
  );
}
