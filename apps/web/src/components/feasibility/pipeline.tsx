'use client';

import {
  Button,
  cn,
  ErrorMessage,
  FieldShell,
  formatDateTimeFa,
  Select,
  SuccessMessage,
  toPersianDigits,
} from '@roshd/ui';
import {
  FEASIBILITY_SECTORS,
  FEASIBILITY_STATUS_LABELS_FA,
  type FeasibilityStatus,
} from '@roshd/validation';
import { useState } from 'react';
import { AsyncBoundary, Pagination } from '@/components/dashboard/ui';
import { apiDownload, saveBlob } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import { ProjectList } from './parts';
import { daysFa } from './stage-age';
import type { StaffRef } from '@/components/dashboard/types';
import type { FeasibilityPipeline, FeasibilityProjectItem } from './types';

const PAGE_SIZE = 20;

/**
 * The pipeline of the feasibility projects for the staff (ST-35.15): how many projects are in
 * every status and for how long, narrowed by sector and expert, the projects behind the numbers
 * with the longest-waiting first, and the same projects as a CSV file.
 */
export function PipelineDashboard() {
  const [sector, setSector] = useState('');
  const [expertId, setExpertId] = useState('');
  /** The chosen expert as they were offered, for when the pipeline does not list them. */
  const [chosenExpert, setChosenExpert] = useState<StaffRef | null>(null);
  const [status, setStatus] = useState<FeasibilityStatus | ''>('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const filters = new URLSearchParams();
  if (sector) filters.set('sector', sector);
  if (expertId) filters.set('expertId', expertId);
  const narrowed = new URLSearchParams(filters);
  if (status) narrowed.set('status', status);
  const listQuery = new URLSearchParams(narrowed);
  listQuery.set('scope', 'all');
  listQuery.set('sort', 'waiting');
  listQuery.set('page', String(page));
  listQuery.set('pageSize', String(PAGE_SIZE));

  const qs = filters.toString();
  const pipeline = useApi<FeasibilityPipeline>(
    `/feasibility-projects/pipeline${qs ? `?${qs}` : ''}`,
  );
  const list = useApi<FeasibilityProjectItem[]>(`/feasibility-projects?${listQuery.toString()}`);
  const asOf = pipeline.state.status === 'success' ? pipeline.state.data.asOf : undefined;
  const offered = pipeline.state.status === 'success' ? pipeline.state.data.experts : [];
  // The filter keeps saying who it narrows by, also while the pipeline is loading or has
  // failed, and when that expert works on no project any more.
  const experts =
    chosenExpert && !offered.some((expert) => expert.id === chosenExpert.id)
      ? [...offered, chosenExpert]
      : offered;

  const narrow = (change: () => void) => {
    change();
    setPage(1);
    setExportMessage(null);
  };

  const runExport = async () => {
    setExporting(true);
    setExportMessage(null);
    const query = narrowed.toString();
    const result = await apiDownload(
      `/feasibility-projects/export${query ? `?${query}` : ''}`,
      'feasibility-projects.csv',
    );
    setExporting(false);
    if (!result.ok) {
      setExportMessage({ ok: false, text: result.message });
      return;
    }
    saveBlob(result.blob, result.fileName);
    setExportMessage({
      ok: true,
      text:
        result.rows === null
          ? 'فایل خروجی آماده شد.'
          : `فایل خروجی با ${toPersianDigits(result.rows)} ردیف آماده شد.`,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <FieldShell id="fp-pipeline-sector" label="حوزه طرح" className="w-56">
          <Select
            id="fp-pipeline-sector"
            value={sector}
            disabled={exporting}
            onChange={(e) => narrow(() => setSector(e.target.value))}
          >
            <option value="">همه حوزه‌ها</option>
            {FEASIBILITY_SECTORS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </FieldShell>
        <FieldShell id="fp-pipeline-expert" label="کارشناس" className="w-56">
          <Select
            id="fp-pipeline-expert"
            value={expertId}
            disabled={exporting}
            onChange={(e) =>
              narrow(() => {
                setExpertId(e.target.value);
                setChosenExpert(experts.find((expert) => expert.id === e.target.value) ?? null);
              })
            }
          >
            <option value="">همه کارشناسان</option>
            <option value="none">بدون کارشناس</option>
            {experts.map((expert) => (
              <option key={expert.id} value={expert.id}>
                {expert.fullName}
              </option>
            ))}
          </Select>
        </FieldShell>
      </div>

      <AsyncBoundary state={pipeline.state} reload={pipeline.reload}>
        {(data) => (
          <section aria-labelledby="fp-pipeline-title" className="flex flex-col gap-3">
            <h2 id="fp-pipeline-title" className="text-lg font-bold text-brand-900">
              پروژه‌ها در هر مرحله
            </h2>
            <p className="text-[13px] text-ink-5">
              {toPersianDigits(data.total)} پروژه · مدت ماندن از آخرین تغییر وضعیت هر پروژه شمرده
              می‌شود · محاسبه‌شده در {formatDateTimeFa(data.asOf)}
            </p>
            <div className="overflow-x-auto rounded-card border border-line bg-white">
              <table className="w-full border-collapse text-[15px]">
                <caption className="sr-only">تعداد پروژه‌ها و مدت ماندن آن‌ها در هر وضعیت</caption>
                <thead>
                  <tr className="border-b border-line text-sm text-ink-5">
                    <th scope="col" className="px-4 py-2 text-start font-semibold">
                      وضعیت
                    </th>
                    <th scope="col" className="px-4 py-2 text-end font-semibold">
                      تعداد
                    </th>
                    <th scope="col" className="px-4 py-2 text-end font-semibold">
                      بیشترین ماندگاری
                    </th>
                    <th scope="col" className="px-4 py-2 text-end font-semibold">
                      میانگین ماندگاری
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.stages.map((stage) => (
                    <tr
                      key={stage.status}
                      className={cn(
                        'border-b border-line-2 last:border-b-0',
                        status === stage.status && 'bg-surface',
                      )}
                    >
                      <th scope="row" className="px-4 py-2 text-start font-normal">
                        <button
                          type="button"
                          aria-pressed={status === stage.status}
                          disabled={exporting}
                          className="rounded-sm font-bold text-brand-900 underline-offset-4 hover:underline"
                          onClick={() =>
                            narrow(() => setStatus(status === stage.status ? '' : stage.status))
                          }
                        >
                          {FEASIBILITY_STATUS_LABELS_FA[stage.status]}
                        </button>
                      </th>
                      <td className="px-4 py-2 text-end">{toPersianDigits(stage.count)}</td>
                      <td className="px-4 py-2 text-end">
                        {stage.longestDays === null ? '—' : daysFa(stage.longestDays)}
                      </td>
                      <td className="px-4 py-2 text-end">
                        {stage.averageDays === null ? '—' : daysFa(stage.averageDays)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-ink-5">
              برای دیدن پروژه‌های یک وضعیت، نام آن را در جدول انتخاب کنید.
            </p>
          </section>
        )}
      </AsyncBoundary>

      <section aria-labelledby="fp-pipeline-list-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="fp-pipeline-list-title" className="text-lg font-bold text-brand-900">
            {status
              ? `پروژه‌های «${FEASIBILITY_STATUS_LABELS_FA[status]}»`
              : 'پروژه‌ها به ترتیب ماندگاری'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {status ? (
              <Button
                variant="ghost"
                disabled={exporting}
                onClick={() => narrow(() => setStatus(''))}
              >
                همه وضعیت‌ها
              </Button>
            ) : null}
            <Button variant="ghost" disabled={exporting} onClick={() => void runExport()}>
              {exporting ? 'در حال آماده‌سازی…' : 'خروجی Excel (CSV)'}
            </Button>
          </div>
        </div>
        <p className="text-[13px] text-ink-5">
          خروجی با همین فیلترها گرفته می‌شود، نام متقاضیان و کارشناسان را دارد و ثبت می‌شود.
        </p>
        {exportMessage ? (
          exportMessage.ok ? (
            <SuccessMessage>{exportMessage.text}</SuccessMessage>
          ) : (
            <ErrorMessage>{exportMessage.text}</ErrorMessage>
          )
        ) : null}
        <AsyncBoundary state={list.state} reload={list.reload}>
          {(items) => (
            <>
              <ProjectList
                items={items}
                hrefBase="/dashboard/manage/feasibility"
                stageAsOf={asOf}
                empty={{
                  title: 'پروژه‌ای یافت نشد',
                  description: 'با این فیلترها پروژه‌ای در خط لوله نیست.',
                }}
              />
              {list.state.status === 'success' ? (
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={list.state.meta?.total ?? items.length}
                  onChange={setPage}
                />
              ) : null}
            </>
          )}
        </AsyncBoundary>
      </section>
    </div>
  );
}
