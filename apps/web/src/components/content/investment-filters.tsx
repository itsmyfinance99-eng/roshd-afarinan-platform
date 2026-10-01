'use client';

import {
  INVESTMENT_SECTOR_LABELS_FA,
  INVESTMENT_SECTORS,
  PROJECT_STAGE_LABELS_FA,
  PROJECT_STAGES,
  type InvestmentSector,
  type ProjectStage,
} from '@roshd/validation';
import { useId, type FormEvent } from 'react';
import { ChipLinks, FilterLink, useListingNav } from './listing-client';

const control =
  'h-[46px] rounded-card border border-line-strong bg-brand-700 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-200 ease-state focus:border-focus focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_15%,transparent)] focus-visible:outline-none';

function href(query: { q?: string; stage?: string; sector?: string }) {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.sector) params.set('sector', query.sector);
  if (query.stage) params.set('stage', query.stage);
  const qs = params.toString();
  return `/investment${qs ? `?${qs}` : ''}`;
}

/**
 * Investment filter panel (design Investment.dc.html): search, stage select, conditional reset
 * and sliding sector chips. It is a plain GET form, so it also works without JavaScript; with
 * JavaScript every change navigates inside the listing transition (skeleton while loading).
 */
export function InvestmentFilters({
  q,
  stage,
  sector,
}: {
  q?: string;
  stage?: ProjectStage;
  sector?: InvestmentSector;
}) {
  const { navigate } = useListingNav();
  const searchId = useId();
  const stageId = useId();
  const filtered = Boolean(q || stage || sector);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    navigate(
      href({
        q: String(data.get('q') ?? '').trim() || undefined,
        stage: String(data.get('stage') ?? '') || undefined,
        sector,
      }),
    );
  };

  return (
    <div
      data-reveal=""
      className="mb-3 flex flex-col gap-3.5 rounded-[12px] border border-line bg-brand-700 p-3.5"
    >
      <form
        action="/investment"
        method="get"
        role="search"
        aria-label="فیلترها"
        onSubmit={submit}
        className="flex flex-wrap items-center gap-3"
      >
        {sector ? <input type="hidden" name="sector" value={sector} /> : null}
        <div className="relative min-w-0 flex-[1_1_260px]">
          <label htmlFor={searchId} className="sr-only">
            جستجو در پروژه‌ها
          </label>
          <input
            id={searchId}
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder="جستجوی عنوان یا استان…"
            className={`${control} w-full ps-[42px] pe-3 placeholder:text-ink-5`}
          />
          <button
            type="submit"
            aria-label="اعمال فیلترها"
            className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-control text-ink-5 hover:text-accent"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
          </button>
        </div>
        <label htmlFor={stageId} className="flex items-center gap-2 text-sm font-semibold text-ink">
          مرحله
          <select
            id={stageId}
            name="stage"
            defaultValue={stage ?? ''}
            onChange={(e) => navigate(href({ q, sector, stage: e.target.value || undefined }))}
            className={`${control} cursor-pointer px-2.5 text-sm`}
          >
            <option value="">همه مراحل</option>
            {PROJECT_STAGES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STAGE_LABELS_FA[s]}
              </option>
            ))}
          </select>
        </label>
        {filtered ? (
          <FilterLink
            href="/investment"
            className="flex h-[46px] items-center rounded-card border border-line-strong bg-brand-700 px-3.5 text-sm font-semibold whitespace-nowrap text-ink no-underline transition-colors hover:border-primary hover:text-accent"
          >
            حذف فیلترها ×
          </FilterLink>
        ) : null}
      </form>
      <ChipLinks
        label="حوزه"
        sliding
        variant="plain"
        className="gap-1.5"
        items={[
          { label: 'همه', href: href({ q, stage }), active: !sector },
          ...INVESTMENT_SECTORS.map((s) => ({
            label: INVESTMENT_SECTOR_LABELS_FA[s],
            href: href({ q, stage, sector: s }),
            active: sector === s,
          })),
        ]}
      />
    </div>
  );
}
