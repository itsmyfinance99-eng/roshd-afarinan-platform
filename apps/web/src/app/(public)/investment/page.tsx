import { buttonClasses, Container, ErrorMessage, Notice, toPersianDigits } from '@roshd/ui';
import {
  INVESTMENT_SECTORS,
  PROJECT_STAGES,
  type InvestmentSector,
  type ProjectStage,
} from '@roshd/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectCard } from '@/components/cards/cards';
import { InvestmentFilters } from '@/components/content/investment-filters';
import {
  ListingCount,
  ListingEmpty,
  ListingTransition,
  PageLinks,
  PendingResults,
} from '@/components/content/listing';
import { PageIntro } from '@/components/layout/page-shell';
import { listInvestments } from '@/lib/investment-api';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'فرصت‌های سرمایه‌گذاری',
  description: 'معرفی پروژه‌ها و طرح‌ها؛ بدون هیچ تراکنش سرمایه‌گذاری آنلاین.',
  path: '/investment',
});

const PAGE_SIZE = 12;
const GRID = 'grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const pick = <T extends string>(value: string | undefined, allowed: readonly T[]) =>
  allowed.find((a) => a === value);

/** Opportunity catalog (design Investment.dc.html); filters live in the URL. */
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
  const allDemo = items.length > 0 && items.every((p) => p.isDemo);

  return (
    <>
      <PageIntro
        path="/investment"
        crumb="فرصت‌های سرمایه‌گذاری"
        title="معرفی پروژه‌ها و طرح‌ها"
        lead="طرح‌هایی که برای مطالعه، امکان‌سنجی یا جذب مشارکت معرفی شده‌اند."
      />
      <ListingTransition>
        <Container className="pt-12 pb-20">
          <Notice className="mb-7">
            {allDemo
              ? 'هیچ‌یک از موارد زیر فرصت واقعی یا باز سرمایه‌گذاری نیست. '
              : 'معرفی طرح به معنای پیشنهاد سرمایه‌گذاری یا تضمین بازده نیست. '}
            اطلاعات بازده یا عملکرد مالی نمایش داده نمی‌شود و این بخش امکان هیچ تراکنشی ندارد.
            {items.some((p) => p.isDemo) && !allDemo
              ? ' موارد برچسب‌خورده «نمونه نمایشی» هستند.'
              : ''}
          </Notice>
          <InvestmentFilters q={q} stage={stage} sector={sector} />
          {result.ok ? (
            <ListingCount className="mb-5">
              {toPersianDigits(result.meta?.total ?? items.length)} طرح
            </ListingCount>
          ) : null}
          {!result.ok ? (
            <ErrorMessage>
              دریافت فهرست طرح‌ها در حال حاضر ممکن نیست. لطفاً چند دقیقه بعد دوباره تلاش کنید.
            </ErrorMessage>
          ) : (
            <PendingResults columns={GRID} skeletons={3} height="h-[440px]">
              {items.length === 0 ? (
                <ListingEmpty
                  title={filtered ? 'طرحی با این فیلترها یافت نشد' : 'هنوز طرحی معرفی نشده است'}
                  description="فیلترها را تغییر دهید یا طرح خود را برای امکان‌سنجی ثبت کنید."
                  resetHref={filtered ? '/investment' : undefined}
                  extraAction={
                    <Link href="/feasibility/request" className={buttonClasses('primary', 'md')}>
                      ثبت پروژه برای امکان‌سنجی
                    </Link>
                  }
                />
              ) : (
                <section aria-labelledby="projects-heading">
                  <h2 id="projects-heading" className="sr-only">
                    فهرست طرح‌های سرمایه‌گذاری
                  </h2>
                  <div data-stagger="70" className={`grid gap-5 ${GRID}`}>
                    {items.map((project) => (
                      <div key={project.id} data-reveal="">
                        <ProjectCard project={project} />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </PendingResults>
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
        </Container>
      </ListingTransition>
    </>
  );
}
