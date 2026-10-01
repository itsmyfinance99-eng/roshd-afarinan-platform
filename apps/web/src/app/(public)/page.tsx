import { Notice, sectionLinkClasses } from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ContentCard, CourseCard } from '@/components/cards/cards';
import { JourneysBento, TrustBento } from '@/components/home/bento';
import { HomeHero } from '@/components/home/hero';
import { ProjectPreview } from '@/components/home/project-preview';
import {
  ExperienceMarquee,
  FinalCta,
  FutureCapabilities,
  HomeSectionHeader,
  ProcessRail,
  ServicesPaper,
  StudiedProjects,
} from '@/components/home/sections';
import { Intro } from '@/components/motion/intro';
import { listContent } from '@/lib/content-api';
import { listInvestments } from '@/lib/investment-api';
import { listCourses } from '@/lib/learning-api';
import { listResearch } from '@/lib/research-api';
import { jsonLdScript, organizationJsonLd, pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({ path: '/' });

/** Static page refreshed every 5 minutes so newly published knowledge entries appear. */
export const revalidate = 300;

const emptyColumn =
  'rounded-card border border-dashed border-line-strong bg-brand-700 p-6 text-sm text-ink-3';

/** Home (design/claude-design/prototype/Home.dc.html, v2 "Copper & Graphite"). */
export default async function HomePage() {
  const [knowledge, courses, research, investments] = await Promise.all([
    listContent('KNOWLEDGE', { pageSize: 3 }),
    listCourses({ pageSize: 4 }),
    listResearch({ pageSize: 3 }),
    listInvestments({ pageSize: 6 }),
  ]);
  const opportunities = investments.ok ? investments.data : [];
  /** Opportunities already under study (past the idea stage). */
  const studied = opportunities.filter((p) => p.stage !== 'IDEA').slice(0, 3);
  const latestResearch = research.ok ? research.data : [];
  const featuredCourses = courses.ok ? courses.data : [];
  const latestKnowledge = knowledge.ok ? knowledge.data : [];
  const allDemo = opportunities.length > 0 && opportunities.every((p) => p.isDemo);

  return (
    // The home canvas is one step lighter than inner pages (design Home wrapper #1A1F26).
    <div className="bg-brand-700">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(organizationJsonLd())}
      />
      <Intro logoSrc="/brand/logo.png" />

      <HomeHero />
      <ExperienceMarquee />
      <JourneysBento />
      <TrustBento />
      <ServicesPaper />

      {/* Opportunities under study (hidden when there are none) */}
      {studied.length > 0 ? <StudiedProjects projects={studied} /> : null}

      {/* Courses (latest published; hidden until the catalog has courses) */}
      {featuredCourses.length > 0 ? (
        <section
          aria-labelledby="courses-title"
          className="mx-auto max-w-(--container-page) px-6 pb-[88px]"
        >
          <HomeSectionHeader
            id="courses-title"
            eyebrow="آموزش"
            title="دوره‌های آموزشی"
            size="md"
            className="mb-7"
            action={
              <Link href="/training" className={sectionLinkClasses()}>
                همه دوره‌ها ‹
              </Link>
            }
          />
          <div
            data-stagger="80"
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-5"
          >
            {featuredCourses.map((course) => (
              <div key={course.id} data-reveal="">
                <CourseCard course={course} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Research + knowledge (latest published) */}
      <section aria-label="پژوهش و دانشنامه" className="border-y border-line bg-brand-800">
        <div className="mx-auto grid max-w-(--container-page) grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] gap-12 px-6 py-[88px]">
          <div>
            <div data-reveal="" className="mb-5 flex items-baseline justify-between">
              <h2 className="font-display text-[26px] font-extrabold text-ink">پژوهش‌های منتخب</h2>
              <Link href="/research" className={sectionLinkClasses('text-sm')}>
                همه ‹
              </Link>
            </div>
            {latestResearch.length === 0 ? (
              <p className={emptyColumn}>گزارش‌های پژوهشی به‌زودی منتشر می‌شوند.</p>
            ) : (
              <div data-stagger="80" className="flex flex-col gap-3">
                {latestResearch.map((item) => (
                  <div key={item.id} data-reveal="">
                    <ContentCard
                      item={{
                        id: item.id,
                        title: item.title,
                        summary: item.summary,
                        category: item.category?.name ?? '',
                        date: item.publishedAt ?? item.updatedAt,
                        isDemo: item.isDemo,
                      }}
                      cta="مشاهده پژوهش"
                      href={`/research/${item.slug}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div data-reveal="" className="mb-5 flex items-baseline justify-between">
              <h2 className="font-display text-[26px] font-extrabold text-ink">مطالب دانشنامه</h2>
              <Link href="/knowledge" className={sectionLinkClasses('text-sm')}>
                همه ‹
              </Link>
            </div>
            {latestKnowledge.length === 0 ? (
              <p className={emptyColumn}>مدخل‌های دانشنامه به‌زودی منتشر می‌شوند.</p>
            ) : (
              <div data-stagger="80" className="flex flex-col gap-3">
                {latestKnowledge.map((entry) => (
                  <div key={entry.id} data-reveal="">
                    <ContentCard
                      item={{
                        id: entry.id,
                        title: entry.title,
                        summary: entry.excerpt ?? '',
                        category: entry.category?.name ?? '',
                        date: entry.publishedAt ?? entry.updatedAt,
                        isDemo: entry.isDemo,
                      }}
                      cta="مطالعه مدخل"
                      href={`/knowledge/${entry.slug}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Investment preview (latest published; hidden until there are opportunities) */}
      {opportunities.length > 0 ? (
        <section
          aria-labelledby="inv-title"
          className="mx-auto max-w-(--container-page) px-6 pt-[88px] pb-24"
        >
          <HomeSectionHeader
            id="inv-title"
            eyebrow="فرصت‌های سرمایه‌گذاری"
            title="پیش‌نمایش پروژه‌ها"
            size="md"
            className="mb-5"
            action={
              <Link href="/investment" className={sectionLinkClasses()}>
                مشاهده همه ‹
              </Link>
            }
          />
          <Notice className="mb-6">
            {allDemo
              ? 'همه پروژه‌های این بخش نمونه نمایشی هستند و فرصت واقعی یا باز سرمایه‌گذاری محسوب نمی‌شوند.'
              : `معرفی طرح به معنای پیشنهاد سرمایه‌گذاری یا تضمین بازده نیست.${
                  opportunities.some((p) => p.isDemo)
                    ? ' موارد برچسب‌خورده «نمونه نمایشی» هستند.'
                    : ''
                }`}
          </Notice>
          <ProjectPreview projects={opportunities} />
        </section>
      ) : null}

      <ProcessRail />
      <FutureCapabilities />
      <FinalCta />
    </div>
  );
}
