'use client';

import { Button, ErrorMessage, SuccessMessage, toPersianDigits } from '@roshd/ui';
import { REPORT_FILE_UNIT, REPORTING_UNIT_LABELS_FA } from '@roshd/validation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { BAD_FILE_ADDRESS_FA, saveSignedFile } from '@/lib/signed-file';

interface ReportFile {
  number: number;
  fileName: string;
  size: number;
  sha256: string;
  url: string;
}

/**
 * The PDF of a version of a report (ST-35.13). The server writes the file the first time it is
 * asked for, which takes a moment, and answers with an address that expires; the browser then
 * saves the file. The hash of the file is shown, so that a copy can be checked against it.
 */
export function ReportFileDownload({
  path,
  number,
}: {
  /** The API path of the version, without its query. */
  path: string;
  number: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<ReportFile | null>(null);
  /** Counts the downloads, so that a second one of the same file is announced again. */
  const [downloads, setDownloads] = useState(0);

  const download = async () => {
    setBusy(true);
    setError(null);
    const result = await apiFetch<ReportFile>(`${path}/file`, { method: 'POST', body: {} });
    setBusy(false);
    if (!result.ok) {
      setFile(null);
      setError(result.message);
      return;
    }
    if (!saveSignedFile(result.data?.url)) {
      setFile(null);
      setError(BAD_FILE_ADDRESS_FA);
      return;
    }
    setFile(result.data);
    setDownloads((count) => count + 1);
  };

  return (
    <section aria-labelledby="report-file" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="report-file" className="text-sm font-bold text-ink">
          فایل این نسخه
        </h2>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void download()}
        >
          {busy ? 'در حال آماده‌سازی PDF…' : `دریافت PDF نسخه ${toPersianDigits(number)}`}
        </Button>
      </div>
      <p className="text-[13px] leading-6 text-ink-3">
        فایل PDF همین نسخه با همه فصل‌ها، جدول‌ها و نمودارها؛ مبلغ‌های آن به{' '}
        {REPORTING_UNIT_LABELS_FA[REPORT_FILE_UNIT]} است. پس از تأیید نهایی، نام و زمان دو تأیید روی
        جلد فایل می‌آید. ساخت فایل در بار نخست چند لحظه طول می‌کشد.
      </p>
      {/* One live region: what is going on is said once, also to a screen reader. */}
      <p className="sr-only" role="status">
        {busy ? 'در حال آماده‌سازی فایل PDF…' : ''}
      </p>
      {file ? (
        <SuccessMessage key={downloads}>
          فایل PDF نسخه {toPersianDigits(file.number)} آماده شد و دریافت آن آغاز شد.
          <span className="mt-1 block text-[13px] font-normal">
            اثر انگشت فایل (SHA-256):{' '}
            <bdi dir="ltr" className="font-mono break-all">
              {file.sha256}
            </bdi>
          </span>
        </SuccessMessage>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </section>
  );
}
