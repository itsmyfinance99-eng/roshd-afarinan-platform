'use client';

import {
  Button,
  EmptyState,
  ErrorMessage,
  formatDateFa,
  Skeleton,
  Tag,
  toPersianDigits,
} from '@roshd/ui';
import { MAX_FILE_BYTES, QUESTIONNAIRE_LIMITS, type ProjectDocumentKind } from '@roshd/validation';
import { useEffect, useRef, useState } from 'react';
import type { StaffRef } from '@/components/dashboard/types';
import { FILE_ACCEPT, FILE_TYPES_LABEL, fileProblem, formatSize } from '@/components/files/files';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

interface DocumentFile {
  id: string;
  version: number;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  removable: boolean;
  /** Staff and experts only. */
  uploadedBy?: StaffRef | null;
}

interface DocumentSlot {
  kind: ProjectDocumentKind;
  key: string;
  label: string;
  help?: string;
  required: boolean;
  origin: 'template' | 'applicant' | 'staff';
  maxFiles?: number;
  files: DocumentFile[];
}

/** Mirrors GET /api/v1/feasibility-projects/:id/documents. */
export interface ProjectDocumentsData {
  slots: DocumentSlot[];
  access: { upload: boolean };
}

const ORIGIN_LABELS: Partial<Record<DocumentSlot['origin'], string>> = {
  applicant: 'افزوده متقاضی',
  staff: 'افزوده کارشناسان',
};

/** How many more files a slot takes: versions of a document, or files of a file question. */
const roomOf = (slot: DocumentSlot): number =>
  slot.kind === 'ANSWER' ? (slot.maxFiles ?? QUESTIONNAIRE_LIMITS.files) - slot.files.length : 1;

function Slot({
  slot,
  base,
  canUpload,
  onChanged,
}: {
  slot: DocumentSlot;
  base: string;
  canUpload: boolean;
  onChanged: (data: ProjectDocumentsData) => void;
}) {
  const id = `doc-${slot.kind}-${slot.key}`;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = slot.kind === 'ANSWER';
  const room = roomOf(slot);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = fileProblem(file);
    setError(problem);
    if (problem) return;
    const form = new FormData();
    form.append('kind', slot.kind);
    form.append('key', slot.key);
    form.append('file', file);
    setBusy(true);
    const result = await apiFetch<ProjectDocumentsData>(base, { method: 'POST', body: form });
    setBusy(false);
    if (result.ok) onChanged(result.data);
    else setError(result.message);
  };

  const download = async (file: DocumentFile) => {
    setError(null);
    const result = await apiFetch<{ url: string }>(`${base}/${file.id}/download-url`, {
      method: 'POST',
      body: {},
    });
    if (result.ok) window.location.assign(result.data.url);
    else setError(result.message);
  };

  const remove = async (file: DocumentFile) => {
    if (!window.confirm(`«${file.originalName}» برداشته شود؟ این کار برگشت ندارد.`)) return;
    setError(null);
    setBusy(true);
    const result = await apiFetch<ProjectDocumentsData>(`${base}/${file.id}`, {
      method: 'DELETE',
    });
    setBusy(false);
    if (result.ok) {
      onChanged(result.data);
      // The button went with its file; the way to hand one in is the nearest thing left.
      requestAnimationFrame(() => document.getElementById(`${id}-upload`)?.focus());
    } else setError(result.message);
  };

  return (
    <li className="rounded-panel border border-line-strong p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p id={`${id}-title`} className="flex flex-wrap items-center gap-2 font-bold text-ink">
            <span>
              {slot.label}
              {slot.required ? (
                <span className="ms-1 text-danger" aria-hidden="true">
                  *
                </span>
              ) : null}
            </span>
            {slot.required ? <span className="sr-only">(الزامی)</span> : null}
            {ORIGIN_LABELS[slot.origin] ? <Tag>{ORIGIN_LABELS[slot.origin]}</Tag> : null}
            {slot.required && slot.files.length === 0 ? <Tag>بارگذاری نشده</Tag> : null}
          </p>
          {slot.help ? <p className="mt-1 text-[13px] text-ink-3">{slot.help}</p> : null}
        </div>
        {canUpload ? (
          <div className="flex shrink-0 flex-col items-start gap-1">
            <input
              ref={input}
              type="file"
              accept={FILE_ACCEPT}
              className="sr-only"
              // The visible button is the control; keep this input out of focus and the a11y tree.
              tabIndex={-1}
              aria-hidden="true"
              disabled={busy}
              onChange={(e) => void upload(e)}
            />
            <Button
              id={`${id}-upload`}
              variant="outline"
              size="sm"
              disabled={busy || room <= 0}
              aria-describedby={`${id}-title`}
              onClick={() => input.current?.click()}
            >
              {busy
                ? 'در حال بارگذاری…'
                : answer
                  ? 'افزودن فایل'
                  : slot.files.length > 0
                    ? 'بارگذاری نسخه تازه'
                    : 'بارگذاری'}
            </Button>
            {answer ? (
              <span className="text-xs text-ink-5">
                {toPersianDigits(slot.files.length)} از{' '}
                {toPersianDigits(slot.maxFiles ?? QUESTIONNAIRE_LIMITS.files)} فایل
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {slot.files.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {slot.files.map((file, i) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold break-all text-ink-2">{file.originalName}</span>
                  {answer ? null : (
                    <Tag>
                      نسخه {toPersianDigits(file.version)}
                      {i === 0 && slot.files.length > 1 ? ' · آخرین' : ''}
                    </Tag>
                  )}
                </span>
                <span className="text-xs text-ink-5">
                  {formatSize(file.size)} · {formatDateFa(file.uploadedAt)}
                  {file.uploadedBy ? ` · ${file.uploadedBy.fullName}` : ''}
                </span>
              </span>
              <span className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`دریافت ${file.originalName}`}
                  onClick={() => void download(file)}
                >
                  دریافت
                </Button>
                {file.removable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`برداشتن ${file.originalName}`}
                    onClick={() => void remove(file)}
                  >
                    برداشتن
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-5">هنوز فایلی بارگذاری نشده است.</p>
      )}
      {error ? <ErrorMessage className="mt-3">{error}</ErrorMessage> : null}
    </li>
  );
}

function Group({
  title,
  note,
  slots,
  base,
  canUpload,
  onChanged,
}: {
  title: string;
  note?: string;
  slots: DocumentSlot[];
  base: string;
  canUpload: boolean;
  onChanged: (data: ProjectDocumentsData) => void;
}) {
  if (slots.length === 0) return null;
  return (
    <div>
      <h3 className="text-base font-extrabold text-brand-900">{title}</h3>
      {note ? <p className="mt-1 text-[13px] text-ink-3">{note}</p> : null}
      <ul className="mt-3 flex flex-col gap-3">
        {slots.map((slot) => (
          <Slot
            key={`${slot.kind}:${slot.key}`}
            slot={slot}
            base={base}
            canUpload={canUpload}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * The documents of a feasibility project (ST-35.06): what its questionnaire asks to be handed
 * in, with the files there are. The applicant hands in files while the project is open, a
 * document as a new version each time; everybody who sees the project downloads them through a
 * short-lived link. `revision` makes the list read again when the questionnaire changed (an
 * item with a document was added or removed).
 */
export function ProjectDocuments({
  projectId,
  revision = 0,
  onChanged,
  emptyText = 'این پروژه مدرکی برای بارگذاری ندارد.',
}: {
  projectId: string;
  revision?: number;
  /** A file was handed in or taken back; the answers of file questions changed with it. */
  onChanged?: () => void;
  emptyText?: string;
}) {
  const base = `/feasibility-projects/${encodeURIComponent(projectId)}/documents`;
  const { state, reload } = useApi<ProjectDocumentsData>(base);
  // What an upload or a removal answered, until the list is read again for another reason.
  const [changed, setChanged] = useState<{ revision: number; data: ProjectDocumentsData } | null>(
    null,
  );
  const seen = useRef(revision);
  useEffect(() => {
    if (seen.current === revision) return;
    seen.current = revision;
    reload({ silent: true });
  }, [revision, reload]);

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" aria-label="در حال بارگذاری مدارک" className="flex flex-col gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorMessage>{state.message}</ErrorMessage>
        <Button variant="outline" onClick={() => reload()}>
          تلاش دوباره
        </Button>
      </div>
    );
  }
  const data = changed?.revision === revision ? changed.data : state.data;
  if (data.slots.length === 0) return <EmptyState title={emptyText} />;

  const accept = (next: ProjectDocumentsData) => {
    setChanged({ revision, data: next });
    onChanged?.();
  };
  return (
    <div className="flex flex-col gap-6">
      {data.access.upload ? (
        <p className="text-[13px] text-ink-3">
          فرمت‌های مجاز: {FILE_TYPES_LABEL} · حداکثر {formatSize(MAX_FILE_BYTES)} برای هر فایل.
          مدرکی که دوباره بارگذاری شود نسخه تازه آن است و نسخه‌های قبلی می‌مانند.
        </p>
      ) : null}
      <Group
        title="مدارک"
        slots={data.slots.filter((slot) => slot.kind === 'DOCUMENT')}
        base={base}
        canUpload={data.access.upload}
        onChanged={accept}
      />
      <Group
        title="فایل‌های پاسخ"
        note="فایل‌هایی که پاسخ سؤال‌های پرسشنامه‌اند."
        slots={data.slots.filter((slot) => slot.kind === 'ANSWER')}
        base={base}
        canUpload={data.access.upload}
        onChanged={accept}
      />
    </div>
  );
}
