'use client';

import { EmptyState, FieldShell, Notice, Select } from '@roshd/ui';
import { REPORTING_UNIT_LABELS_FA, REPORTING_UNITS, type ReportingUnit } from '@roshd/validation';
import { useEffect, useState } from 'react';
import { AsyncBoundary } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';
import type { ReportDocument } from './report-types';
import { ReportDocumentView } from './report-view';
import { hasReview, ReviewThreads } from './review-cycle';
import type { FeasibilityProjectDetail } from './types';

const DEFAULT_UNIT: ReportingUnit = '1000000';

/**
 * A report read from the API (ST-35.12): a version, or the preview of the draft, with the
 * amounts of its schedules in the unit the reader chooses. Under the report are the review
 * threads of the study; «نظرهای بازبینی این فصل» opens them on the chapter it belongs to.
 */
export function ReportReader({
  project,
  side,
  path,
}: {
  project: FeasibilityProjectDetail;
  side: 'applicant' | 'staff';
  /** The API path of the report, without its query. */
  path: string;
}) {
  const [unit, setUnit] = useState<ReportingUnit>(DEFAULT_UNIT);
  /** The chapter whose threads were asked for; a new object on every click. */
  const [focus, setFocus] = useState<{ section: string } | null>(null);
  const section = focus?.section ?? '';
  const { state, reload } = useApi<ReportDocument>(`${path}?unit=${unit}`);
  const threads = hasReview(project);

  // The threads are under the report: the reader is taken to them, with the keyboard too.
  useEffect(() => {
    if (focus) document.getElementById('threads-section')?.focus();
  }, [focus]);

  return (
    <div className="flex flex-col gap-8">
      <AsyncBoundary state={state} reload={reload}>
        {(report) => (
          <>
            {report.issues && report.issues.length > 0 ? (
              <Notice>
                <span className="font-bold">این پیش‌نویس هنوز قابل صدور نیست:</span>
                <ul className="mt-1 list-disc ps-5">
                  {report.issues.map((issue, index) => (
                    <li key={index}>{issue.message}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            {report.omitted && report.omitted.length > 0 ? (
              <Notice>
                این فصل‌ها در گزارش نمی‌آید، چون اجرای محاسبه تحلیل اقتصادی ندارد و متنی هم برایشان
                نوشته نشده است: {report.omitted.map((chapter) => `«${chapter.title}»`).join('، ')}
              </Notice>
            ) : null}
            {report.run ? (
              <FieldShell id="report-unit" label="واحد نمایش مبلغ‌ها" className="max-w-xs">
                <Select
                  id="report-unit"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value as ReportingUnit)}
                >
                  {REPORTING_UNITS.map((value) => (
                    <option key={value} value={value}>
                      {REPORTING_UNIT_LABELS_FA[value]}
                    </option>
                  ))}
                </Select>
              </FieldShell>
            ) : null}
            {report.chapters.length === 0 ? (
              <EmptyState
                title="گزارش هنوز فصلی ندارد"
                description="فصلی برای نمایش در این گزارش نیست."
              />
            ) : (
              <ReportDocumentView
                report={report}
                onComments={threads ? (key) => setFocus({ section: key }) : undefined}
              />
            )}
          </>
        )}
      </AsyncBoundary>
      {threads ? (
        <ReviewThreads
          key={`threads-${section}`}
          project={project}
          side={side}
          initialSection={section}
        />
      ) : null}
    </div>
  );
}
