import { buttonClasses, Container, DemoBadge, formatDateFa, toPersianDigits } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarkdownBody } from '@/components/content/markdown';
import { PageIntro } from '@/components/layout/page-shell';
import { site } from '@/content/site';
import { siteUrl } from '@/lib/env';
import { getResearch, type ResearchDetail } from '@/lib/research-api';
import { jsonLdScript } from '@/lib/seo';

export const revalidate = 300;

type Params = Promise<{ slug: string }>;

/** Missing, unpublished or malformed slugs are a real 404; an unavailable API is an error. */
async function loadResearch(slug: string): Promise<ResearchDetail> {
  const result = await getResearch(slug);
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    throw new Error('Research catalog unavailable');
  }
  return result.data;
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

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(jsonLd)} />
      <PageIntro
        path={path}
        crumb={project.title}
        parent={{ label: 'پژوهش', href: '/research' }}
        eyebrow={project.category?.name ?? 'پژوهش'}
        title={project.title}
        lead={project.summary}
      />
      <Container className="py-12">
        <div className="mb-8 flex flex-wrap items-center gap-3 text-sm text-ink-5">
          {project.isDemo ? <DemoBadge /> : null}
          {project.year ? <span>سال {toPersianDigits(project.year)}</span> : null}
          {project.publishedAt ? (
            <time dateTime={project.publishedAt}>انتشار: {formatDateFa(project.publishedAt)}</time>
          ) : null}
        </div>
        <MarkdownBody source={project.body} />
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-card border border-line-2 bg-surface p-7">
          <p className="text-[17px] font-bold text-brand-900">
            به مطالعه‌ای مشابه برای سازمان یا طرح خود نیاز دارید؟
          </p>
          <Link href="/research/request" className={buttonClasses('primary', 'md', 'h-12')}>
            ثبت سفارش پژوهش
          </Link>
        </div>
        <p className="mt-10">
          <Link href="/research" className="font-bold no-underline">
            بازگشت به پژوهش‌ها ‹
          </Link>
        </p>
      </Container>
    </>
  );
}
