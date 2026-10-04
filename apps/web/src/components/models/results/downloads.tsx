'use client';

import { Button, ErrorMessage, SuccessMessage } from '@roshd/ui';
import type { CalculationExportFormat, ReportingUnit } from '@roshd/validation';
import { useState } from 'react';
import { apiDownload, saveBlob } from '@/lib/api-client';

const FORMATS: readonly (readonly [CalculationExportFormat, string])[] = [
  ['xlsx', 'Excel'],
  ['pdf', 'PDF'],
  ['html', 'HTML'],
];

/**
 * The files of a run (ST-34.09): the inputs, the indicators and every schedule as xlsx, PDF or
 * standalone HTML. The server writes all three from the stored run, in the display unit chosen
 * on the page.
 */
export function RunDownloads({
  modelId,
  runId,
  unit,
}: {
  modelId: string;
  runId: string;
  unit: ReportingUnit;
}) {
  const [busy, setBusy] = useState<CalculationExportFormat | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const download = async (format: CalculationExportFormat, name: string) => {
    setBusy(format);
    setMessage(null);
    const result = await apiDownload(
      `/financial-models/${modelId}/runs/${runId}/export?format=${format}&unit=${unit}`,
      `financial-model-run.${format}`,
    );
    setBusy(null);
    if (!result.ok) {
      setMessage({ ok: false, text: result.message });
      return;
    }
    saveBlob(result.blob, result.fileName);
    setMessage({ ok: true, text: `فایل ${name} این اجرا آماده شد.` });
  };

  return (
    <section aria-labelledby="run-downloads" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="run-downloads" className="text-sm font-bold text-ink">
          دریافت خروجی این اجرا
        </h2>
        {FORMATS.map(([format, name]) => (
          <Button
            key={format}
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void download(format, name)}
          >
            {busy === format ? 'در حال آماده‌سازی…' : `خروجی ${name}`}
          </Button>
        ))}
      </div>
      <p className="text-[13px] leading-6 text-ink-3">
        هر سه فایل از همین اجرای ذخیره‌شده ساخته می‌شوند و ورودی‌ها، شاخص‌ها و همه جدول‌ها را با
        واحد نمایش انتخاب‌شده دارند.
      </p>
      {message ? (
        message.ok ? (
          <SuccessMessage>{message.text}</SuccessMessage>
        ) : (
          <ErrorMessage>{message.text}</ErrorMessage>
        )
      ) : null}
    </section>
  );
}
