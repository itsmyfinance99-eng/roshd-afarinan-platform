import {
  buttonClasses,
  Container,
  DemoBadge,
  Notice,
  ordinal,
  Section,
  SectionHeader,
  Tag,
} from '@roshd/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ContentCard, CourseCard } from '@/components/cards/cards';
import { InvestmentPreview } from '@/components/sections/investment-preview';
import { ProcessSteps } from '@/components/sections/process-steps';
import { demoProjects, demoResearch, sectors } from '@/content/demo';
import {
  consultingServices,
  credentials,
  EMPHASISED_PATH_STEPS,
  expertise,
  futureCapabilities,
  hero,
  journeys,
  pathSteps,
  processSteps,
  stats,
} from '@/content/site';
import { listContent } from '@/lib/content-api';
import { listCourses } from '@/lib/learning-api';
import { jsonLdScript, organizationJsonLd, pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({ path: '/' });

/** Static page refreshed every 5 minutes so newly published knowledge entries appear. */
export const revalidate = 300;

const allLink = 'text-[15px] font-bold text-primary no-underline';

export default async function HomePage() {
  const [knowledge, courses] = await Promise.all([
    listContent('KNOWLEDGE', { pageSize: 3 }),
    listCourses({ pageSize: 4 }),
  ]);
  const featuredCourses = courses.ok ? courses.data : [];
  const latestKnowledge = knowledge.ok ? knowledge.data : [];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(organizationJsonLd())}
      />

      {/* HERO */}
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden border-b border-line bg-surface"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(#e3e9f2_1px,transparent_1px),linear-gradient(90deg,#e3e9f2_1px,transparent_1px)] bg-size-[56px_56px] opacity-70"
        />
        <div className="relative mx-auto grid max-w-(--container-page) grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-center gap-14 px-6 py-[clamp(48px,7vw,96px)]">
          <div>
            <p className="mb-[18px] text-[15px] font-bold text-primary">{hero.eyebrow}</p>
            <h1
              id="hero-title"
              className="text-[clamp(34px,4.6vw,58px)] leading-[1.35] font-black text-balance text-brand-900"
            >
              {hero.title}
            </h1>
            <p className="mt-6 max-w-[600px] text-[clamp(16px,1.6vw,19px)] leading-[2.1] text-pretty text-ink-3">
              {hero.lead}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href={hero.primaryCta.href} className={buttonClasses('primary', 'lg')}>
                {hero.primaryCta.label}
              </Link>
              <Link href={hero.secondaryCta.href} className={buttonClasses('secondary', 'lg')}>
                {hero.secondaryCta.label}
              </Link>
            </div>
          </div>
          <div className="rounded-panel border border-line-2 bg-white px-7 py-8">
            <p className="mb-[22px] text-sm font-bold text-ink-4">{hero.pathTitle}</p>
            <ol className="flex flex-col">
              {pathSteps.map((label, i) => {
                const emphasised = EMPHASISED_PATH_STEPS.includes(i);
                const last = i === pathSteps.length - 1;
                return (
                  <li key={label} className="flex items-stretch gap-4">
                    <div className="flex w-[18px] flex-col items-center">
                      <span
                        className="mt-[5px] size-3.5 shrink-0 rounded-full border-[3px] border-white"
                        style={{
                          background: emphasised ? '#1450c8' : '#0ba5e0',
                          boxShadow: `0 0 0 2px ${emphasised ? '#1450c8' : '#0ba5e0'}`,
                        }}
                      />
                      {last ? null : <span className="w-0.5 flex-1 bg-[#cfdaee]" />}
                    </div>
                    <div className="flex items-baseline gap-3 pb-3.5">
                      <span className="text-xs text-ink-5 tabular-nums">{ordinal(i)}</span>
                      <span
                        className={
                          emphasised ? 'text-base font-extrabold' : 'text-base font-medium'
                        }
                      >
                        {label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      {/* FOUR JOURNEYS */}
      <Container className="pt-20 pb-6">
        <section aria-labelledby="journeys-title">
          <h2
            id="journeys-title"
            className="mb-8 text-[clamp(26px,3vw,36px)] font-extrabold text-brand-900"
          >
            چهار مسیر اصلی
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-5">
            {journeys.map((journey, i) => (
              <Link
                key={journey.key}
                href={journey.href}
                className="flex min-h-[300px] flex-col gap-4 rounded-card border border-t-4 border-line-2 border-t-primary bg-white px-7 py-8 text-ink no-underline hover:border-primary hover:bg-surface-hover hover:text-ink"
              >
                <span className="text-[15px] font-bold text-primary">{ordinal(i)}</span>
                <span className="text-[32px] font-black text-brand-900">{journey.title}</span>
                <span className="text-base leading-loose text-pretty text-ink-3">
                  {journey.description}
                </span>
                <span className="mt-auto text-[15px] font-bold text-primary">ورود به مسیر ‹</span>
              </Link>
            ))}
          </div>
        </section>
      </Container>

      {/* TRUST */}
      <Container className="py-20">
        <section aria-labelledby="trust-title">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-12">
            <div>
              <p className="mb-2.5 text-sm font-bold text-primary">تخصص و سابقه</p>
              <h2
                id="trust-title"
                className="text-[clamp(26px,3vw,36px)] leading-normal font-extrabold text-pretty text-brand-900"
              >
                گروهی تخصصی در آموزش، پژوهش و مشاوره
              </h2>
              <ul className="mt-6 flex flex-wrap gap-2">
                {expertise.map((item) => (
                  <li
                    key={item}
                    className="rounded-chip border border-line-3 px-3 py-1.5 text-sm text-ink-2"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] border-t-2 border-brand-900">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col gap-2 border-b border-line py-6 ps-0 pe-5"
                >
                  <dt className="order-2 text-base font-bold text-ink">{stat.label}</dt>
                  <dd className="order-1 text-[44px] leading-tight font-black text-primary">
                    {stat.value}
                  </dd>
                  <dd className="order-3 text-sm leading-[1.9] text-ink-4">{stat.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-12 rounded-card border border-dashed border-[#c3cde0] p-6">
            <h3 className="mb-3 text-sm font-bold text-ink-2">مجوزها و عضویت‌ها</h3>
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3 text-sm text-ink-3">
              {credentials.map((item) => (
                <li key={item} className="rounded-chip bg-surface px-3 py-2.5">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-5">
              نشان‌ها و جزئیات مدارک پس از دریافت و تأیید نسخه رسمی آن‌ها منتشر می‌شود.
            </p>
          </div>
        </section>
      </Container>

      {/* CONSULTING SERVICES */}
      <Section tone="muted" aria-labelledby="services-title">
        <Container className="py-20">
          <SectionHeader
            id="services-title"
            eyebrow="خدمات مشاوره"
            title="خدمات تخصصی"
            action={
              <Link href="/consulting" className={allLink}>
                همه خدمات ‹
              </Link>
            }
          />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-px overflow-hidden rounded-card border border-line-2 bg-line-2">
            {consultingServices.map((service, i) => (
              <Link
                key={service.key}
                href="/consulting"
                className="flex min-h-[170px] flex-col gap-2.5 bg-white p-7 no-underline hover:bg-surface-hover"
              >
                <span className="text-[13px] text-ink-5">{ordinal(i)}</span>
                <h3 className="text-[19px] font-extrabold text-brand-900">{service.title}</h3>
                <p className="text-sm leading-[1.9] text-pretty text-ink-4">
                  {service.description}
                </p>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      {/* FEATURED FEASIBILITY (demo) */}
      <Container className="py-20">
        <section aria-labelledby="feas-title">
          <SectionHeader
            id="feas-title"
            eyebrow="امکان‌سنجی"
            title="نمونه طرح‌های در حال مطالعه"
            action={<DemoBadge>محتوای نمایشی — طرح واقعی نیست</DemoBadge>}
          />
          <div role="table" aria-label="نمونه طرح‌ها" className="border-t-2 border-brand-900">
            {demoProjects.slice(0, 3).map((p) => (
              <div
                key={p.id}
                role="row"
                className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] items-center gap-x-6 gap-y-3 border-b border-line py-[22px]"
              >
                <div role="cell" className="col-span-2 min-w-0">
                  <span className="mb-1 block text-[13px] font-bold text-primary">
                    {p.sectorLabel}
                  </span>
                  <span className="text-[17px] font-bold text-ink">{p.title}</span>
                </div>
                <div role="cell" className="text-sm text-ink-3">
                  <span className="text-ink-5">موقعیت: </span>
                  {p.location}
                </div>
                <div role="cell" className="text-sm text-ink-3">
                  <span className="text-ink-5">مرحله: </span>
                  {p.stage}
                </div>
                <div role="cell" className="text-sm text-ink-3">
                  <span className="text-ink-5">خدمت: </span>
                  {p.service}
                </div>
                <div role="cell">
                  <Link
                    href="/feasibility/request"
                    className="text-sm font-bold text-primary no-underline"
                  >
                    درخواست مشابه ‹
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Container>

      {/* COURSES (latest published; hidden until the catalog has courses) */}
      {featuredCourses.length > 0 ? (
        <Container className="pb-20">
          <section aria-labelledby="courses-title">
            <SectionHeader
              id="courses-title"
              eyebrow="آموزش"
              title="دوره‌های آموزشی"
              action={
                <Link href="/training" className={allLink}>
                  همه دوره‌ها ‹
                </Link>
              }
            />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-5">
              {featuredCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          </section>
        </Container>
      ) : null}

      {/* RESEARCH + KNOWLEDGE (demo) */}
      <Section tone="muted" aria-label="پژوهش و دانشنامه">
        <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] gap-12 py-20">
          <div>
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-[26px] font-extrabold text-brand-900">پژوهش‌های منتخب</h2>
              <Link href="/research" className="text-sm font-bold text-primary no-underline">
                همه ‹
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              {demoResearch.slice(0, 3).map((item) => (
                <ContentCard key={item.id} item={item} cta="مشاهده پژوهش" href="/research" />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-[26px] font-extrabold text-brand-900">مطالب دانشنامه</h2>
              <Link href="/knowledge" className="text-sm font-bold text-primary no-underline">
                همه ‹
              </Link>
            </div>
            {latestKnowledge.length === 0 ? (
              <p className="rounded-card border border-dashed border-line-strong bg-white p-6 text-sm text-ink-4">
                مدخل‌های دانشنامه به‌زودی منتشر می‌شوند.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {latestKnowledge.map((entry) => (
                  <ContentCard
                    key={entry.id}
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
                ))}
              </div>
            )}
          </div>
        </Container>
      </Section>

      {/* INVESTMENT PREVIEW (demo) */}
      <Container className="py-20">
        <section aria-labelledby="inv-title">
          <SectionHeader
            id="inv-title"
            eyebrow="فرصت‌های سرمایه‌گذاری"
            title="پیش‌نمایش پروژه‌ها"
            className="mb-5"
            action={
              <Link href="/investment" className={allLink}>
                مشاهده همه ‹
              </Link>
            }
          />
          <Notice className="mb-6">
            همه پروژه‌های این بخش نمونه نمایشی هستند و فرصت واقعی یا باز سرمایه‌گذاری محسوب
            نمی‌شوند.
          </Notice>
          <InvestmentPreview projects={demoProjects} sectors={sectors} />
        </section>
      </Container>

      {/* PROCESS */}
      <Section tone="dark" aria-labelledby="process-title">
        <Container className="py-20">
          <SectionHeader
            id="process-title"
            eyebrow="فرایند انجام کار"
            title="از ثبت درخواست تا تحویل"
            tone="dark"
            className="mb-12"
          />
          <ProcessSteps steps={processSteps} />
          <Link
            href="/feasibility/request"
            className={buttonClasses('inverse', 'md', 'mt-10 h-[50px] px-6 font-extrabold')}
          >
            شروع با ثبت درخواست امکان‌سنجی
          </Link>
        </Container>
      </Section>

      {/* FUTURE */}
      <Container className="py-20">
        <section aria-labelledby="future-title">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2
              id="future-title"
              className="text-[clamp(22px,2.4vw,28px)] font-extrabold text-brand-900"
            >
              قابلیت‌های توسعه آینده
            </h2>
            <Tag>هنوز در دسترس نیست</Tag>
          </div>
          <p className="mb-7 max-w-[720px] text-[15px] leading-loose text-ink-4">
            این قابلیت‌ها در نقشه راه توسعه پلتفرم قرار دارند و در نسخه فعلی ارائه نمی‌شوند.
          </p>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
            {futureCapabilities.map((item) => (
              <li
                key={item.title}
                className="flex flex-col gap-2 rounded-card border border-dashed border-line-strong bg-surface-muted p-5"
              >
                <span aria-hidden="true" className="size-2.5 rounded-full border-2 border-accent" />
                <h3 className="text-base font-bold text-ink-2">{item.title}</h3>
                <p className="text-[13px] leading-[1.9] text-ink-4">{item.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </Container>

      {/* FINAL CTA */}
      <Container className="pb-20">
        <section
          aria-labelledby="cta-title"
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-8 rounded-panel border border-line-2 bg-surface p-[clamp(32px,5vw,64px)]"
        >
          <h2
            id="cta-title"
            className="text-[clamp(24px,3vw,34px)] leading-normal font-extrabold text-pretty text-brand-900"
          >
            طرح یا پرسشی دارید؟ با کارشناسان ما در ارتباط باشید.
          </h2>
          <div className="flex flex-wrap justify-end gap-3">
            <Link href="/contact" className={buttonClasses('primary', 'lg')}>
              درخواست مشاوره
            </Link>
            <Link href="/feasibility/request" className={buttonClasses('secondary', 'lg')}>
              ثبت پروژه برای امکان‌سنجی
            </Link>
          </div>
        </section>
      </Container>
    </>
  );
}
