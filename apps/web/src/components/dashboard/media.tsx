'use client';

import { Button, cn, EmptyState, ErrorMessage, FieldShell, Skeleton, TextInput } from '@roshd/ui';
import { MAX_FILE_BYTES, PUBLIC_IMAGE_EXTENSIONS, PUBLIC_IMAGE_TYPES } from '@roshd/validation';
import { useId, useRef, useState } from 'react';
import { formatSize } from '@/components/files/files';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import { Pagination } from './ui';

/** Mirrors the API MediaView. */
export interface MediaItem {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

const ACCEPT = [...PUBLIC_IMAGE_TYPES, ...PUBLIC_IMAGE_EXTENSIONS.map((e) => `.${e}`)].join(',');
const LIBRARY_PAGE_SIZE = 12;

/**
 * Image field for content and catalog editors: upload to the public media library, pick an
 * earlier upload, or type a site path. The value is always a site-relative path.
 */
export function ImageField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const libraryId = useId();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const preview = value.startsWith('/') && !value.startsWith('//') ? value : null;

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadError(null);
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    if (!PUBLIC_IMAGE_EXTENSIONS.includes(ext)) {
      setUploadError('فقط تصویر PNG، JPEG یا WebP پذیرفته می‌شود.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError(`حجم تصویر بیش از ${formatSize(MAX_FILE_BYTES)} است.`);
      return;
    }
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    const result = await apiFetch<MediaItem>('/media', { method: 'POST', body: form });
    setUploading(false);
    if (result.ok) onChange(result.data.url);
    else setUploadError(result.message);
  };

  return (
    <div className="flex flex-col gap-3">
      <FieldShell id={id} label={label} error={error} hint={hint}>
        <TextInput
          id={id}
          dir="ltr"
          className="text-right"
          hasHint={Boolean(hint)}
          value={value}
          error={error}
          onChange={(e) => onChange(e.target.value)}
        />
      </FieldShell>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- media library path, size unknown
        <img
          src={preview}
          alt="پیش‌نمایش تصویر انتخاب‌شده"
          className="aspect-video w-full max-w-sm rounded-card border border-line object-cover"
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void upload(e)}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? 'در حال بارگذاری…' : 'بارگذاری تصویر'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={libraryOpen}
          aria-controls={libraryId}
          onClick={() => setLibraryOpen((o) => !o)}
        >
          {libraryOpen ? 'بستن کتابخانه' : 'انتخاب از کتابخانه'}
        </Button>
        {value ? (
          <Button variant="ghost" size="sm" onClick={() => onChange('')}>
            حذف تصویر
          </Button>
        ) : null}
        <span className="text-xs text-ink-5">
          PNG، JPEG یا WebP · حداکثر {formatSize(MAX_FILE_BYTES)}
        </span>
      </div>
      {uploadError ? <ErrorMessage>{uploadError}</ErrorMessage> : null}
      {libraryOpen ? (
        <div id={libraryId}>
          <MediaLibrary
            selected={value}
            onPick={(url) => {
              onChange(url);
              setLibraryOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MediaLibrary({ selected, onPick }: { selected: string; onPick: (url: string) => void }) {
  const [page, setPage] = useState(1);
  const { state, reload } = useApi<MediaItem[]>(
    `/media?page=${page}&pageSize=${LIBRARY_PAGE_SIZE}`,
  );

  if (state.status === 'loading') {
    return (
      <div
        aria-busy="true"
        aria-label="در حال بارگذاری کتابخانه تصاویر"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-video" />
        ))}
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-2">
        <ErrorMessage>{state.message}</ErrorMessage>
        <Button variant="outline" size="sm" onClick={() => reload()}>
          تلاش دوباره
        </Button>
      </div>
    );
  }
  if (state.data.length === 0) {
    return (
      <EmptyState
        title="کتابخانه تصاویر خالی است"
        description="نخستین تصویر را با «بارگذاری تصویر» اضافه کنید."
      />
    );
  }
  return (
    <div className="rounded-card border border-line p-3">
      <ul
        aria-label="کتابخانه تصاویر"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      >
        {state.data.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-pressed={item.url === selected}
              aria-label={`انتخاب ${item.originalName}`}
              onClick={() => onPick(item.url)}
              className={cn(
                'block w-full overflow-hidden rounded-card border-2 bg-surface focus-visible:outline-2 focus-visible:outline-primary',
                item.url === selected
                  ? 'border-primary'
                  : 'border-transparent hover:border-line-hover',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- media library thumbnail */}
              <img
                src={item.url}
                alt=""
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
              <span className="block truncate px-2 py-1 text-start text-xs text-ink-4">
                {item.originalName}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Pagination
        page={page}
        pageSize={LIBRARY_PAGE_SIZE}
        total={state.meta?.total ?? state.data.length}
        onChange={setPage}
      />
    </div>
  );
}
