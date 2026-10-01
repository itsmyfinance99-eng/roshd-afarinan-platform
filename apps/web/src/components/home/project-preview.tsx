'use client';

import { chipClasses, EmptyIcon, SlidingChips } from '@roshd/ui';
import {
  INVESTMENT_SECTOR_LABELS_FA,
  INVESTMENT_SECTORS,
  PROJECT_STAGE_LABELS_FA,
  type InvestmentSector,
  type ProjectStage,
} from '@roshd/validation';
import { useId, useState } from 'react';
import { ProjectCard } from '@/components/cards/cards';
import type { InvestmentSummary } from '@/lib/investment-api';

type SectorFilter = 'all' | InvestmentSector;
type StageFilter = 'all' | ProjectStage;

/**
 * Home project preview (design Home §7): sector chips with the sliding indicator and a stage
 * select over the latest published opportunities. Filtering is local and instant, so there is
 * no loading state here; the full, URL-driven filters live on /investment.
 */
export function ProjectPreview({ projects }: { projects: InvestmentSummary[] }) {
  const [sector, setSector] = useState<SectorFilter>('all');
  const [stage, setStage] = useState<StageFilter>('all');
  const stageId = useId();
  const stages = Array.from(new Set(projects.map((p) => p.stage)));
  const filtered = projects.filter(
    (p) => (sector === 'all' || p.sector === sector) && (stage === 'all' || p.stage === stage),
  );
  const sectors: Array<{ value: SectorFilter; label: string }> = [
    { value: 'all', label: 'همه' },
    ...INVESTMENT_SECTORS.map((s) => ({ value: s, label: INVESTMENT_SECTOR_LABELS_FA[s] })),
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        <SlidingChips label="فیلتر حوزه">
          {sectors.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === sector}
              onClick={() => setSector(option.value)}
              className={chipClasses(option.value === sector)}
            >
              {option.label}
            </button>
          ))}
        </SlidingChips>
        <label htmlFor={stageId} className="flex items-center gap-2 text-sm text-ink-3">
          مرحله
          <select
            id={stageId}
            value={stage}
            onChange={(e) => setStage(e.target.value as StageFilter)}
            className="h-10 cursor-pointer rounded-control border border-line-strong bg-brand-700 px-2.5 text-sm text-ink"
          >
            <option value="all">همه مراحل</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STAGE_LABELS_FA[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <div
          role="status"
          className="rounded-panel border border-dashed border-line-strong bg-brand-800 px-6 py-14 text-center"
        >
          <EmptyIcon />
          <p className="mt-3 mb-2 text-lg font-bold text-ink">پروژه‌ای با این فیلترها وجود ندارد</p>
          <p className="mb-4 text-sm text-ink-3">
            فیلترها را تغییر دهید یا پروژه خود را برای امکان‌سنجی ثبت کنید.
          </p>
          <button
            type="button"
            onClick={() => {
              setSector('all');
              setStage('all');
            }}
            className="h-[42px] cursor-pointer rounded-control border border-primary bg-brand-700 px-[18px] text-sm font-bold text-accent"
          >
            حذف فیلترها
          </button>
        </div>
      ) : (
        <div
          data-stagger="80"
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5"
        >
          {filtered.map((project) => (
            <div key={project.id} data-reveal="">
              <ProjectCard project={project} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
