'use client';

import { Button, ChipGroup, EmptyState, formatDateFa, toPersianDigits } from '@roshd/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ContentCard, CourseCard, ProjectCard } from '@/components/cards/cards';
import type { DemoCourse, DemoEntry, DemoProject, SectorKey } from '@/content/types';

const ALL = 'همه';

function categoryOptions(items: { category: string }[]) {
  return [ALL, ...Array.from(new Set(items.map((i) => i.category)))].map((c) => ({
    value: c,
    label: c,
  }));
}

export function TrainingCatalog({ courses }: { courses: DemoCourse[] }) {
  const [category, setCategory] = useState(ALL);
  const [freeOnly, setFreeOnly] = useState(false);
  const options = useMemo(() => categoryOptions(courses), [courses]);
  const visible = courses.filter(
    (c) => (category === ALL || c.category === category) && (!freeOnly || c.free),
  );

  return (
    <>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <ChipGroup
          label="دسته‌بندی دوره‌ها"
          options={options}
          value={category}
          onChange={setCategory}
        />
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={() => setFreeOnly(!freeOnly)}
            className="size-[18px] accent-primary"
          />
          فقط دوره‌های رایگان
        </label>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="دوره‌ای در این دسته وجود ندارد"
          description="دسته دیگری را انتخاب کنید."
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,270px),1fr))] gap-5">
          {visible.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </>
  );
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

/** Searchable glossary list (knowledge base). */
export function KnowledgeCatalog({ items }: { items: DemoEntry[] }) {
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');
  const options = useMemo(() => categoryOptions(items), [items]);
  const q = query.trim();
  const visible = items.filter(
    (k) =>
      (category === ALL || k.category === category) &&
      (!q || k.title.includes(q) || k.summary.includes(q)),
  );

  return (
    <>
      <label htmlFor="kq" className="mb-2 block text-sm font-bold text-ink-2">
        جستجو در دانشنامه
      </label>
      <input
        id="kq"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="مثلاً: طرح توجیهی"
        className="h-[54px] w-full rounded-control border border-line-strong px-4 text-base outline-none focus-visible:border-primary"
      />
      <div className="mt-4 mb-7">
        <ChipGroup
          label="دسته"
          options={options}
          value={category}
          onChange={setCategory}
          size="sm"
        />
      </div>
      <p aria-live="polite" className="sr-only">
        {toPersianDigits(visible.length)} مدخل
      </p>
      {visible.length === 0 ? (
        <EmptyState title="مدخلی یافت نشد" description="عبارت دیگری را جستجو کنید." />
      ) : (
        <ul className="border-t border-line-2">
          {visible.map((k) => (
            <li key={k.id} className="border-b border-line-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 py-5">
                <span className="text-lg font-extrabold text-brand-900">{k.title}</span>
                <span className="text-[13px] font-bold text-primary">{k.category}</span>
                <span className="text-sm leading-[1.9] text-ink-4">{k.summary}</span>
                <time dateTime={k.date} className="text-[13px] text-ink-5">
                  {formatDateFa(k.date)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
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
