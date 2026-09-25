'use client';

import { Button, ChipGroup, EmptyState, formatDateFa, toPersianDigits } from '@roshd/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ContentCard, ProjectCard } from '@/components/cards/cards';
import type { DemoEntry, DemoProject, SectorKey } from '@/content/types';

const ALL = 'همه';

function categoryOptions(items: { category: string }[]) {
  return [ALL, ...Array.from(new Set(items.map((i) => i.category)))].map((c) => ({
    value: c,
    label: c,
  }));
}

/** Category chips over a card grid (research, articles). */
export function EntryCatalog({
  items,
  label,
  withImage = false,
}: {
  items: DemoEntry[];
  label: string;
  withImage?: boolean;
}) {
  const [category, setCategory] = useState(ALL);
  const options = useMemo(() => categoryOptions(items), [items]);
  const visible = items.filter((i) => category === ALL || i.category === category);

  return (
    <>
      <div className="mb-7">
        <ChipGroup label={label} options={options} value={category} onChange={setCategory} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-5">
        {visible.map((item) =>
          withImage ? (
            <div
              key={item.id}
              className="flex flex-col overflow-hidden rounded-card border border-line"
            >
              <div
                role="img"
                aria-label="جای تصویر مقاله"
                className="flex aspect-video items-center justify-center bg-[repeating-linear-gradient(135deg,#eef2f8_0_10px,#e5ebf4_10px_20px)] font-mono text-xs text-ink-5"
              >
                تصویر مقاله
              </div>
              <div className="-m-px flex-1">
                <ContentCard item={item} />
              </div>
            </div>
          ) : (
            <ContentCard key={item.id} item={item} />
          ),
        )}
      </div>
    </>
  );
}

const ALL_STAGES = 'همه مراحل';

export function InvestmentCatalog({
  projects,
  sectors,
}: {
  projects: DemoProject[];
  sectors: { value: 'all' | SectorKey; label: string }[];
}) {
  const [sector, setSector] = useState<'all' | SectorKey>('all');
  const [stage, setStage] = useState(ALL_STAGES);
  const [query, setQuery] = useState('');
  const stages = useMemo(
    () => [ALL_STAGES, ...Array.from(new Set(projects.map((p) => p.stage)))],
    [projects],
  );
  const q = query.trim();
  const visible = projects.filter(
    (p) =>
      (sector === 'all' || p.sector === sector) &&
      (stage === ALL_STAGES || p.stage === stage) &&
      (!q || p.title.includes(q) || p.location.includes(q)),
  );
  const reset = () => {
    setSector('all');
    setStage(ALL_STAGES);
    setQuery('');
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-6">
      <aside
        aria-label="فیلترها"
        className="flex flex-col gap-5 rounded-card border border-line-2 p-5"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="inv-q" className="text-sm font-bold text-ink-2">
            جستجو
          </label>
          <input
            id="inv-q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="عنوان یا استان…"
            className="h-11 rounded-control border border-line-strong px-3 text-sm outline-none focus-visible:border-primary"
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold text-ink-2">حوزه</legend>
          {sectors.map((s) => (
            <label
              key={s.value}
              className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm text-ink-2"
            >
              <input
                type="radio"
                name="sector"
                checked={sector === s.value}
                onChange={() => setSector(s.value)}
                className="size-[18px] accent-primary"
              />
              {s.label}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="inv-stage" className="text-sm font-bold text-ink-2">
            مرحله
          </label>
          <select
            id="inv-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="h-11 rounded-control border border-line-strong bg-white px-2.5 text-sm"
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <Button variant="ghost" onClick={reset}>
          حذف فیلترها
        </Button>
      </aside>
      <div className="flex min-w-0 flex-col gap-4 md:col-span-2">
        <p aria-live="polite" className="text-sm text-ink-4">
          {toPersianDigits(visible.length)} پروژه نمونه
        </p>
        {visible.length === 0 ? (
          <EmptyState
            title="پروژه‌ای یافت نشد"
            description="فیلترها را تغییر دهید یا طرح خود را برای امکان‌سنجی ثبت کنید."
            action={
              <Link href="/feasibility/request" className="font-bold no-underline">
                ثبت پروژه برای امکان‌سنجی ‹
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-5">
            {visible.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
