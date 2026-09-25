import { Container, DemoBadge, Section, Tag } from '@roshd/ui';
import type { Metadata } from 'next';
import { ProjectCard } from '@/components/cards/cards';
import { PageIntro } from '@/components/layout/page-shell';
import { demoProjects } from '@/content/demo';
import { pathSteps } from '@/content/site';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'ایران سهامدار',
  description:
    'ایران سهامدار حلقه پایانی مسیر پلتفرم است؛ جایی که طرح‌های مطالعه‌شده برای معرفی آماده می‌شوند.',
  path: '/iran-sahamdar',
});

export default function IranSahamdarPage() {
  const last = pathSteps.length - 1;
  return (
    <>
      <PageIntro
        path="/iran-sahamdar"
        crumb="ایران سهامدار"
        title="معرفی پروژه‌ها و ارتباط با زیرساخت سرمایه‌گذاری"
        lead="ایران سهامدار حلقه پایانی مسیر پلتفرم است؛ جایی که طرح‌های مطالعه‌شده برای معرفی آماده می‌شوند."
      />

      <Container className="py-16">
        <h2 className="mb-6 text-[clamp(22px,2.6vw,30px)] font-extrabold text-brand-900">
          جایگاه در مسیر پلتفرم
        </h2>
        <ol className="flex flex-wrap items-center gap-y-2.5">
          {pathSteps.map((label, i) => (
            <li key={label} className="flex items-center">
              <span
                aria-current={i === last ? 'step' : undefined}
                className={
                  i === last
                    ? 'rounded-chip border border-brand-900 bg-brand-900 px-3.5 py-2.5 text-sm font-bold text-white'
                    : 'rounded-chip border border-line-strong bg-white px-3.5 py-2.5 text-sm font-bold text-ink-2'
                }
              >
                {label}
              </span>
              {i < last ? <span aria-hidden="true" className="h-0.5 w-5 bg-line-strong" /> : null}
            </li>
          ))}
        </ol>
      </Container>

      <Container className="pb-16">
        <div className="rounded-panel border border-dashed border-[#c3cde0] bg-surface-muted p-[clamp(24px,4vw,40px)]">
          <Tag>به‌زودی</Tag>
          <h2 className="mt-3.5 mb-2.5 text-[22px] font-extrabold text-brand-900">
            اتصال به ایران سهامدار
          </h2>
          <p className="max-w-3xl text-[15px] leading-loose text-ink-3">
            نحوه اتصال، ثبت و نمایش پروژه‌ها پس از دریافت مشخصات رسمی و در مراحل بعدی توسعه تعریف
            می‌شود. نسخه فعلی هیچ ارتباط واقعی با این سامانه ندارد.
          </p>
        </div>
      </Container>

      <Section tone="muted" aria-labelledby="samples-title">
        <Container className="py-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2
              id="samples-title"
              className="text-[clamp(22px,2.6vw,30px)] font-extrabold text-brand-900"
            >
              نمونه پروژه‌های قابل معرفی
            </h2>
            <DemoBadge />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-5">
            {demoProjects.slice(2, 5).map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
