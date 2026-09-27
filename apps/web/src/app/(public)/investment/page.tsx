import { Container, EmptyState, ErrorMessage, Notice, toPersianDigits } from '@roshd/ui';
import {
  INVESTMENT_SECTOR_LABELS_FA,
  INVESTMENT_SECTORS,
  PROJECT_STAGE_LABELS_FA,
  PROJECT_STAGES,
  type InvestmentSector,
  type ProjectStage,
} from '@roshd/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectCard } from '@/components/cards/cards';
import { PageLinks } from '@/components/content/listing';
import { PageIntro } from '@/components/layout/page-shell';
import { listInvestments } from '@/lib/investment-api';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'فرصت‌های سرمایه‌گذاری',
  description: 'معرفی پروژه‌ها و طرح‌ها؛ بدون هیچ تراکنش سرمایه‌گذاری آنلاین.',
  path: '/investment',
});

const PAGE_SIZE = 12;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const pick = <T extends string>(value: string | undefined, allowed: readonly T[]) =>
  allowed.find((a) => a === value);

const control =
  'h-11 w-full rounded-control border border-line-strong bg-white px-3 text-sm outline-none focus-visible:border-primary';

/** Server-rendered catalog; filters are a plain GET form (works without JavaScript). */
export default async function InvestmentPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const sector: InvestmentSector | undefined = pick(one(params.sector), INVESTMENT_SECTORS);
  const stage: ProjectStage | undefined = pick(one(params.stage), PROJECT_STAGES);
  const q = one(params.q)?.trim().slice(0, 100) || undefined;
  const page = Math.max(1, Number(one(params.page)) || 1);

  const result = await listInvestments({ page, pageSize: PAGE_SIZE, sector, stage, q });
  const items = result.ok ? result.data : [];
  const filters: Record<string, string> = {
    ...(sector ? { sector } : {}),
    ...(stage ? { stage } : {}),
    ...(q ? { q } : {}),
  };
  const filtered = Object.keys(filters).length > 0;

  return (
    <>
      <PageIntro
        path="/investment"
        crumb="فرصت‌های سرمایه‌گذاری"
        title="معرفی پروژه‌ها و طرح‌ها"
        lead="طرح‌هایی که برای مطالعه، امکان‌سنجی یا جذب مشارکت معرفی شده‌اند."
      />
      <Container className="pt-12 pb-20">
        <Notice className="mb-7">
          معرفی طرح به معنای پیشنهاد سرمایه‌گذاری یا تضمین بازده نیست. اطلاعات بازده یا عملکرد مالی
          نمایش داده نمی‌شود و این بخش امکان هیچ تراکنشی ندارد.
          {items.some((p) => p.isDemo) ? ' موارد برچسب‌خورده «نمونه نمایشی» هستند.' : ''}
        </Notice>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-6">
          <form
            action="/investment"
            method="get"
            role="search"
            aria-label="فیلترها"
            className="flex flex-col gap-5 rounded-card border border-line-2 p-5"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="inv-q" className="text-sm font-bold text-ink-2">
                جستجو
              </label>
              <input
                id="inv-q"
                name="q"
                type="search"
                defaultValue={q}
                maxLength={100}
                placeholder="عنوان یا استان…"
                className={control}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="inv-sector" className="text-sm font-bold text-ink-2">
                حوزه
              </label>
              <select id="inv-sector" name="sector" defaultValue={sector ?? ''} className={control}>
                <option value="">همه حوزه‌ها</option>
                {INVESTMENT_SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {INVESTMENT_SECTOR_LABELS_FA[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="inv-stage" className="text-sm font-bold text-ink-2">
                مرحله
              </label>
              <select id="inv-stage" name="stage" defaultValue={stage ?? ''} className={control}>
                <option value="">همه مراحل</option>
                {PROJECT_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STAGE_LABELS_FA[s]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="h-11 cursor-pointer rounded-control bg-primary font-bold text-white"
            >
              اعمال فیلترها
            </button>
            {filtered ? (
              <Link href="/investment" className="text-center text-sm font-bold no-underline">
                حذف فیلترها
              </Link>
            ) : null}
          </form>
          <div className="flex min-w-0 flex-col gap-4 md:col-span-2">
            {result.ok ? (
              <p aria-live="polite" className="text-sm text-ink-4">
                {toPersianDigits(result.meta?.total ?? items.length)} طرح
              </p>
            ) : null}
            {!result.ok ? (
              <ErrorMessage>
                دریافت فهرست طرح‌ها در حال حاضر ممکن نیست. لطفاً چند دقیقه بعد دوباره تلاش کنید.
              </ErrorMessage>
            ) : items.length === 0 ? (
              <EmptyState
                title={filtered ? 'طرحی با این فیلترها یافت نشد' : 'هنوز طرحی معرفی نشده است'}
                description="طرح خود را برای امکان‌سنجی ثبت کنید."
                action={
                  <Link href="/feasibility/request" className="font-bold no-underline">
                    ثبت طرح برای امکان‌سنجی ‹
                  </Link>
                }
              />
            ) : (
              <section aria-labelledby="projects-heading">
                <h2 id="projects-heading" className="sr-only">
                  فهرست طرح‌های سرمایه‌گذاری
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-5">
                  {items.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                </div>
              </section>
            )}
            {result.ok ? (
              <PageLinks
                base="/investment"
                page={page}
                pageSize={PAGE_SIZE}
                total={result.meta?.total ?? items.length}
                query={filters}
              />
            ) : null}
          </div>
        </div>
      </Container>
    </>
  );
}
