import { PageHero } from '@roshd/ui';
import type { ReactNode } from 'react';
import { breadcrumbJsonLd, jsonLdScript } from '@/lib/seo';

/** Inner-page hero with breadcrumb (visible + BreadcrumbList JSON-LD). */
export function PageIntro({
  path,
  crumb,
  eyebrow,
  title,
  lead,
  parent,
}: {
  path: string;
  crumb: string;
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  parent?: { label: string; href: string };
}) {
  const crumbs = [{ label: 'صفحه اصلی', href: '/' }, ...(parent ? [parent] : []), { label: crumb }];
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'صفحه اصلی', path: '/' },
            ...(parent ? [{ name: parent.label, path: parent.href }] : []),
            { name: crumb, path },
          ]),
        )}
      />
      <PageHero crumbs={crumbs} eyebrow={eyebrow ?? crumb} title={title} lead={lead} />
    </>
  );
}
