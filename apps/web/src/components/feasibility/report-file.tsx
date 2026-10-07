'use client';

import { Button, ErrorMessage, SuccessMessage, toPersianDigits } from '@roshd/ui';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';

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
    setFile(result.data);
    // The file is sent as an attachment, so the page stays where it is.
    window.location.assign(result.data.url);
  };

  return (
    <section aria-labelledby="report-file" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="report-file" className="text-sm font-bold text-ink">
          فایل این نسخه
        </h2>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void download()}>
          {busy ? 'در حال آماده‌سازی PDF…' : `دریافت PDF نسخه ${toPersianDigits(number)}`}
        </Button>
      </div>
      <p className="text-[13px] leading-6 text-ink-3">
        فایل PDF همین نسخه با همه فصل‌ها، جدول‌ها و نمودارها؛ مبلغ‌های آن به میلیون است. ساخت فایل
        در بار نخست چند لحظه طول می‌کشد.
      </p>
      <div role="status">
        {file ? (
          <SuccessMessage>
            فایل PDF نسخه {toPersianDigits(file.number)} آماده شد و دریافت آن آغاز شد.
            <span className="mt-1 block text-[13px] font-normal">
              اثر انگشت فایل (SHA-256):{' '}
              <bdi dir="ltr" className="font-mono break-all">
                {file.sha256}
              </bdi>
            </span>
          </SuccessMessage>
        ) : null}
      </div>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </section>
  );
}
