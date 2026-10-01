import { Container } from '@roshd/ui';
import type { PageSection } from '@roshd/validation';
import type { Metadata } from 'next';
import { PageSections } from '@/components/content/page-sections';
import { PageIntro } from '@/components/layout/page-shell';
import { DEFAULT_PAGES } from '@/content/pages';
import { contact } from '@/content/site';
import { getPage } from '@/lib/content-api';
import { pageMetadata } from '@/lib/seo';

/** Refreshed every 5 minutes so published CMS edits appear without a deploy. */
export const revalidate = 300;

const fallback = DEFAULT_PAGES.about;

/** The published CMS page when there is one; otherwise the reviewed content layer (ST-03.04). */
async function loadAbout() {
  const result = await getPage('about');
  return result.ok
    ? {
        title: result.data.title,
        sections: result.data.sections,
        metaTitle: result.data.metaTitle,
        metaDescription: result.data.metaDescription,
        noIndex: result.data.noIndex,
      }
    : {
        title: fallback.title,
        sections: fallback.sections as PageSection[],
        metaTitle: null,
        metaDescription: fallback.metaDescription,
        noIndex: false,
      };
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await loadAbout();
  return pageMetadata({
    title: page.metaTitle ?? page.title,
    description: page.metaDescription ?? fallback.metaDescription,
    path: '/about',
    noIndex: page.noIndex,
  });
}

export default async function AboutPage() {
  const page = await loadAbout();
  const [first, ...rest] = page.sections;
  const intro = first?.type === 'intro' ? first : null;
  const body = intro ? rest : page.sections;

  return (
    <>
      <PageIntro
        path="/about"
        crumb="درباره ما"
        title={intro?.title ?? page.title}
        lead={intro?.lead}
      />
      <PageSections sections={body} />
      <Container className="pb-[72px]">
        <section
          aria-labelledby="office"
          data-reveal=""
          className="rounded-card border border-line bg-brand-800 p-7"
        >
          <h2
            id="office"
            className="mb-3 font-display text-[clamp(22px,2.4vw,28px)] font-extrabold text-ink"
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
