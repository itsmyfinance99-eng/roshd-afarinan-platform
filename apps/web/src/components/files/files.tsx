'use client';

import { Button, ErrorMessage, formatNumber } from '@roshd/ui';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_FILE_TYPES,
  type FilePurpose,
  MAX_FILE_BYTES,
} from '@roshd/validation';
import { useId, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { BAD_FILE_ADDRESS_FA, saveSignedFile } from '@/lib/signed-file';

export interface FileItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export const FILE_ACCEPT = [
  ...Object.keys(ALLOWED_FILE_TYPES),
  ...ALLOWED_EXTENSIONS.map((e) => `.${e}`),
].join(',');
export const FILE_TYPES_LABEL = Object.values(ALLOWED_FILE_TYPES)
  .map((t) => t.label)
  .join('، ');

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
  return `${formatNumber(Math.round((bytes / (1024 * 1024)) * 10) / 10)} مگابایت`;
}

/** Why the server would refuse this file, by the rules it applies (type by name, size); else `null`. */
export function fileProblem(file: File): string | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext))
    return `نوع فایل مجاز نیست. فرمت‌های مجاز: ${FILE_TYPES_LABEL}`;
  if (file.size > MAX_FILE_BYTES) return `حجم فایل بیش از ${formatSize(MAX_FILE_BYTES)} است.`;
  return null;
}

/** Gets a short-lived signed URL, then lets the browser download it. */
export async function downloadFile(id: string): Promise<string | null> {
  const result = await apiFetch<{ url: string }>(`/files/${id}/download-url`, {
    method: 'POST',
    body: {},
  });
  if (!result.ok) return result.message;
  return saveSignedFile(result.data?.url) ? null : BAD_FILE_ADDRESS_FA;
}

/** File picker with client-side checks (type, size) mirroring the server rules. */
export function FileUploader({
  purpose,
  onUploaded,
  disabled = false,
  label = 'افزودن فایل',
}: {
  purpose: FilePurpose;
  onUploaded: (file: FileItem) => void;
  disabled?: boolean;
  label?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    const problem = fileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    const form = new FormData();
    form.append('purpose', purpose);
    form.append('file', file);
    setBusy(true);
    const result = await apiFetch<FileItem>('/files', { method: 'POST', body: form });
    setBusy(false);
    if (result.ok) onUploaded(result.data);
    else setError(result.message);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={FILE_ACCEPT}
          className="sr-only"
          // The visible button below is the control; keep this input out of focus and the a11y tree.
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void onChange(e)}
          disabled={disabled || busy}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'در حال بارگذاری…' : label}
        </Button>
        <span className="text-xs text-ink-5">
          {FILE_TYPES_LABEL} · حداکثر {formatSize(MAX_FILE_BYTES)}
        </span>
      </div>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </div>
  );
}

/** List of files with download (and optional remove) actions. */
export function FileList({
  files,
  onRemove,
  removeLabel = 'حذف',
}: {
  files: FileItem[];
  onRemove?: (file: FileItem) => void;
  removeLabel?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  if (files.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3 py-2 text-sm"
          >
            <span className="flex flex-col">
              <span className="font-bold text-ink-2">{file.originalName}</span>
              <span className="text-xs text-ink-5">{formatSize(file.size)}</span>
            </span>
            <span className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void downloadFile(file.id).then(setError)}
                aria-label={`دریافت ${file.originalName}`}
              >
                دریافت
              </Button>
              {onRemove ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(file)}
                  aria-label={`${removeLabel} ${file.originalName}`}
                >
                  {removeLabel}
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </div>
  );
}
