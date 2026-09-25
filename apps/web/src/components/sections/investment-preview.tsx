'use client';

import { ChipGroup, EmptyState, Button } from '@roshd/ui';
import { useMemo, useState } from 'react';
import { ProjectCard } from '@/components/cards/cards';
import type { DemoProject, SectorKey } from '@/content/types';

const ALL_STAGES = 'همه مراحل';

/** Sector chips + stage select over the (demo) project catalogue. */
export function InvestmentPreview({
  projects,
  sectors,
  limit = 6,
}: {
  projects: DemoProject[];
  sectors: { value: 'all' | SectorKey; label: string }[];
  limit?: number;
}) {
  const [sector, setSector] = useState<'all' | SectorKey>('all');
  const [stage, setStage] = useState(ALL_STAGES);

  const stages = useMemo(
    () => [ALL_STAGES, ...Array.from(new Set(projects.map((p) => p.stage)))],
    [projects],
  );
  const filtered = projects.filter(
    (p) => (sector === 'all' || p.sector === sector) && (stage === ALL_STAGES || p.stage === stage),
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        <ChipGroup label="فیلتر حوزه" options={sectors} value={sector} onChange={setSector} />
        <label className="flex items-center gap-2 text-sm text-ink-3">
          مرحله
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="h-10 rounded-chip border border-line-strong bg-white px-2.5 text-sm text-ink"
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p aria-live="polite" className="sr-only">
        {filtered.length} پروژه نمایش داده می‌شود
      </p>
      {filtered.length === 0 ? (
        <EmptyState
          title="پروژه‌ای با این فیلترها وجود ندارد"
          description="فیلترها را تغییر دهید یا پروژه خود را برای امکان‌سنجی ثبت کنید."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSector('all');
                setStage(ALL_STAGES);
              }}
            >
              حذف فیلترها
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5">
          {filtered.slice(0, limit).map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </>
  );
}
