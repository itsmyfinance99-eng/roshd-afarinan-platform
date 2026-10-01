import {
  buttonClasses,
  DemoBadge,
  formatDateFa,
  sectionLinkClasses,
  Shine,
  toPersianDigits,
} from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DetailLayout, FactList } from '@/components/content/detail-layout';
import { MarkdownBody } from '@/components/content/markdown';
import { ReadingProgress } from '@/components/motion/reading-progress';
import { PageIntro } from '@/components/layout/page-shell';
import { site } from '@/content/site';
import { siteUrl } from '@/lib/env';
import { getResearch, type ResearchDetail } from '@/lib/research-api';
import { jsonLdScript } from '@/lib/seo';
import { requireFound } from '@/lib/server-api';

export const revalidate = 300;

type Params = Promise<{ slug: string }>;

function loadResearch(slug: string): Promise<ResearchDetail> {
  return requireFound(getResearch(slug));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const project = await loadResearch((await params).slug);
  const path = `/research/${project.slug}`;
  const title = project.metaTitle ?? project.title;
  const description = project.metaDescription ?? project.summary;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: project.noIndex || project.isDemo ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'article',
      locale: 'fa_IR',
      siteName: site.name,
      url: path,
      title,
      description,
      publishedTime: project.publishedAt ?? undefined,
      modifiedTime: project.updatedAt,
    },
  };
}

export default async function ResearchProjectPage({ params }: { params: Params }) {
  const project = await loadResearch((await params).slug);
  const path = `/research/${project.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Report',
    headline: project.title,
    description: project.summary,
    url: `${siteUrl}${path}`,
    inLanguage: 'fa-IR',
    datePublished: project.publishedAt ?? undefined,
    dateModified: project.updatedAt,
    publisher: { '@type': 'Organization', name: site.name, logo: `${siteUrl}/brand/logo.png` },
  };

  const facts: [string, string][] = [];
  if (project.category) facts.push(['حوزه', project.category.name]);
  if (project.year) facts.push(['سال', toPersianDigits(project.year)]);
  if (project.publishedAt) facts.push(['انتشار', formatDateFa(project.publishedAt)]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(jsonLd)} />
      <ReadingProgress />
      <PageIntro
        path={path}
        crumb={project.title}
        parent={{ label: 'پژوهش', href: '/research' }}
        eyebrow={project.category?.name ?? 'پژوهش'}
        title={project.title}
        lead={project.summary}
      />
      <DetailLayout
        asideLabel="مشخصات پژوهش"
        aside={
          <>
            <FactList facts={facts} />
            <p className="text-[15px] leading-[1.9] text-ink">
              به مطالعه‌ای مشابه برای سازمان یا طرح خود نیاز دارید؟
            </p>
            <Link href="/research/request" className={buttonClasses('cta', 'xl')}>
              <Shine />
              <span className="relative">ثبت سفارش پژوهش</span>
            </Link>
          </>
        }
      >
        {project.isDemo ? <DemoBadge className="self-start" /> : null}
        <div data-reveal="">
          <MarkdownBody source={project.body} />
        </div>
        <p>
          <Link href="/research" className={sectionLinkClasses()}>
            بازگشت به پژوهش‌ها ‹
          </Link>
        </p>
      </DetailLayout>
    </>
  );
}
