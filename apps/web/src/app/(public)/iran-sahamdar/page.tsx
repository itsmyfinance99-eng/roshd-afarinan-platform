import { cn, DemoBadge, Tag } from '@roshd/ui';
import type { Metadata } from 'next';
import { ProjectCard } from '@/components/cards/cards';
import { PageIntro } from '@/components/layout/page-shell';
import { pathSteps } from '@/content/site';
import { listInvestments } from '@/lib/investment-api';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'ایران سهامدار',
  description:
    'ایران سهامدار حلقه پایانی مسیر پلتفرم است؛ جایی که طرح‌های مطالعه‌شده برای معرفی آماده می‌شوند.',
  path: '/iran-sahamdar',
});

/** Refreshed every 5 minutes so newly published opportunities appear. */
export const revalidate = 300;

const FLOW = ['طرح', 'بررسی', 'معرفی'];

/**
 * Connection flow (design placeholder «نمودار جریان: طرح ← بررسی ← معرفی»), drawn as a small
 * diagram: three nodes right to left with copper packets flowing along the links.
 */
function FlowDiagram() {
  const xs = [270, 160, 50];
  return (
    <svg
      viewBox="0 0 320 180"
      role="img"
      aria-label={`نمودار جریان اتصال: ${FLOW.join('، ')}`}
      className="aspect-video w-full rounded-control bg-brand-700"
    >
      <defs>
        <marker
          id="flow-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5 0 10z" fill="var(--color-line-strong)" />
        </marker>
      </defs>
      {[0, 1].map((i) => (
        <g key={i}>
          <path
            d={`M${xs[i]! - 34} 90H${xs[i + 1]! + 38}`}
            stroke="var(--color-line-strong)"
            strokeWidth="2"
            markerEnd="url(#flow-arrow)"
          />
          <path
            d={`M${xs[i]! - 34} 90H${xs[i + 1]! + 38}`}
            stroke="var(--color-accent)"
            strokeWidth="2.4"
            strokeLinecap="round"
            pathLength={1}
            data-anim="flow"
            style={{ animationDelay: `${i * 0.8}s` }}
          />
        </g>
      ))}
      {FLOW.map((label, i) => {
        const last = i === FLOW.length - 1;
        return (
          <g key={label}>
            <rect
              x={xs[i]! - 34}
              y="68"
              width="68"
              height="44"
              rx="10"
              fill={last ? 'var(--color-primary-soft)' : 'var(--color-brand-800)'}
              stroke={last ? 'var(--color-primary)' : 'var(--color-line-strong)'}
            />
            <text
              x={xs[i]}
              y="95"
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              fill={last ? 'var(--color-accent)' : 'var(--color-ink)'}
            >
              {label}
            </text>
          </g>
        );
      })}
      <circle
        cx={xs[2]}
        cy="90"
        r="30"
        fill="none"
        stroke="var(--color-primary)"
        opacity="0.5"
        data-anim="node"
      />
    </svg>
  );
}

export default async function IranSahamdarPage() {
  const investments = await listInvestments({ pageSize: 3 });
  const projects = investments.ok ? investments.data : [];
  const last = pathSteps.length - 1;
  return (
    <>
      <PageIntro
        path="/iran-sahamdar"
        crumb="ایران سهامدار"
        title="معرفی پروژه‌ها و ارتباط با زیرساخت سرمایه‌گذاری"
        lead="ایران سهامدار حلقه پایانی مسیر پلتفرم است؛ جایی که طرح‌های مطالعه‌شده برای معرفی آماده می‌شوند."
      />

      <section aria-labelledby="path-title" className="mx-auto max-w-(--container-page) px-6 py-16">
        <h2
          id="path-title"
          data-reveal=""
          className="mb-6 font-display text-[clamp(22px,2.6vw,30px)] font-extrabold text-ink"
        >
          جایگاه در مسیر پلتفرم
        </h2>
        <ol data-stagger="50" className="flex flex-wrap items-center gap-y-2.5">
          {pathSteps.map((label, i) => (
            <li key={label} data-reveal="" className="flex items-center">
              <span
                aria-current={i === last ? 'step' : undefined}
                className={cn(
                  'rounded-chip border px-3.5 py-2.5 text-sm font-bold',
                  i === last
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-line-strong bg-brand-700 text-ink-3',
                )}
              >
                {label}
              </span>
              {i < last ? <span aria-hidden="true" className="h-0.5 w-5 bg-line-strong" /> : null}
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="connect-title"
        className="mx-auto max-w-(--container-page) px-6 pb-16"
      >
        <div
          data-reveal=""
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-center gap-8 rounded-panel border border-dashed border-line-strong bg-brand-800 p-[clamp(24px,4vw,40px)]"
        >
          <div>
            <Tag>در این نسخه فعال نیست</Tag>
            <h2
              id="connect-title"
              className="mt-3.5 mb-2.5 font-display text-[22px] font-extrabold text-ink"
            >
              اتصال به ایران سهامدار
            </h2>
            <p className="text-[15px] leading-loose text-ink-3">
              نحوه اتصال، ثبت و نمایش پروژه‌ها پس از دریافت مشخصات رسمی و در مراحل بعدی توسعه تعریف
              می‌شود. نسخه فعلی هیچ ارتباط واقعی با این سامانه ندارد.
            </p>
          </div>
          <FlowDiagram />
        </div>
      </section>

      {projects.length > 0 ? (
        <section aria-labelledby="samples-title" className="border-t border-line bg-brand-800">
          <div className="mx-auto max-w-(--container-page) px-6 py-16">
            <div data-reveal="" className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <h2
                id="samples-title"
                className="font-display text-[clamp(22px,2.6vw,30px)] font-extrabold text-ink"
              >
                طرح‌های معرفی‌شده در پلتفرم
              </h2>
              {projects.some((p) => p.isDemo) ? <DemoBadge size="lg" /> : null}
            </div>
            <div
              data-stagger="70"
              className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-5"
            >
              {projects.map((project) => (
                <div key={project.id} data-reveal="">
                  <ProjectCard project={project} />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
