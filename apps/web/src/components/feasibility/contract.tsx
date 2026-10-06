'use client';

import {
  Button,
  ErrorMessage,
  FieldShell,
  formatDateFa,
  Skeleton,
  SuccessMessage,
  Tag,
  TextArea,
  toPersianDigits,
} from '@roshd/ui';
import { FEASIBILITY_NOTE_MAX, MAX_FILE_BYTES, type FeasibilityStatus } from '@roshd/validation';
import { useEffect, useRef, useState } from 'react';
import type { StaffRef } from '@/components/dashboard/types';
import { FILE_ACCEPT, FILE_TYPES_LABEL, fileProblem, formatSize } from '@/components/files/files';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
import type { FeasibilityProjectDetail } from './types';

interface ContractFile {
  id: string;
  version: number;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedAs: 'applicant' | 'staff';
  confirmedAt: string | null;
  /** Staff only. */
  uploadedBy?: StaffRef | null;
  confirmedBy?: StaffRef | null;
}

/** Mirrors GET /api/v1/feasibility-projects/:id/contract. */
export interface ProjectContractData {
  files: ContractFile[];
  access: { upload: boolean; confirm: boolean };
}

/** Before these the project has no contract step yet, so nothing is asked of the API. */
const BEFORE_CONTRACT: readonly FeasibilityStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'INITIAL_REVIEW',
  'NEEDS_MORE_INFO',
  'COST_ESTIMATED',
];

const SIDE_LABELS: Record<ContractFile['uploadedAs'], string> = {
  applicant: 'بارگذاری متقاضی',
  staff: 'بارگذاری کارشناسان',
};

const GUIDANCE: Record<'applicant' | 'staff', string> = {
  applicant:
    'نسخه امضاشده قرارداد را اینجا بارگذاری کنید. پس از تأیید کارشناسان، کار مطالعه آغاز می‌شود.',
  staff:
    'نسخه امضاشده قرارداد را بارگذاری کنید یا نسخه متقاضی را بررسی کنید. با تأیید یک نسخه، پروژه وارد مرحله «در حال انجام» می‌شود.',
};

/**
 * The contract step of a feasibility study (ST-35.09): while the project waits for its contract,
 * the applicant and the staff hand in copies of the signed contract, each a new version; the
 * staff confirm one, and the work starts. Afterwards both sides still read the copies. `side`
 * is the page the section stands on; what the caller may do comes from the API.
 */
export function ProjectContract({
  project,
  side,
  onChanged,
}: {
  project: FeasibilityProjectDetail;
  side: 'applicant' | 'staff';
  /** The contract was confirmed, so the project has a new status. */
  onChanged: () => void;
}) {
  const waiting = !BEFORE_CONTRACT.includes(project.status);
  const base = `/feasibility-projects/${encodeURIComponent(project.id)}/contract`;
  const { state, reload } = useApi<ProjectContractData>(waiting ? base : null);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  /** What the last upload did, for assistive technology. */
  const [announcement, setAnnouncement] = useState('');

  // What may be done with the contract follows the status of the project.
  const seen = useRef(project.status);
  useEffect(() => {
    if (seen.current === project.status) return;
    seen.current = project.status;
    reload({ silent: true });
  }, [project.status, reload]);

  if (!waiting) return null;

  const heading = (
    <h2 id="contract-title" className="text-base font-extrabold text-brand-900">
      قرارداد
    </h2>
  );
  if (state.status === 'loading') {
    return (
      <section aria-labelledby="contract-title" className="flex flex-col gap-3">
        {heading}
        <div aria-busy="true" aria-label="در حال بارگذاری قرارداد">
          <Skeleton className="h-20" />
        </div>
      </section>
    );
  }
  if (state.status === 'error') {
    return (
      <section aria-labelledby="contract-title" className="flex flex-col items-start gap-3">
        {heading}
        <ErrorMessage>{state.message}</ErrorMessage>
        <Button variant="outline" onClick={() => reload()}>
          تلاش دوباره
        </Button>
      </section>
    );
  }
  const { files, access } = state.data;
  // A project that was closed before any copy was handed in has nothing to show here.
  if (files.length === 0 && !access.upload) return null;

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = fileProblem(file);
    setError(problem);
    if (problem) return;
    const form = new FormData();
    form.append('file', file);
    setBusy('upload');
    const result = await apiFetch<ProjectContractData>(base, { method: 'POST', body: form });
    setBusy(null);
    if (result.ok) setAnnouncement(`«${file.name}» بارگذاری شد.`);
    else setError(result.message);
    // Also after a refusal: the contract may have been confirmed meanwhile.
    reload({ silent: true });
  };

  const download = async (file: ContractFile) => {
    setError(null);
    const result = await apiFetch<{ url: string }>(`${base}/${file.id}/download-url`, {
      method: 'POST',
      body: {},
    });
    if (result.ok) window.location.assign(result.data.url);
    else setError(result.message);
  };

  const confirm = async (file: ContractFile) => {
    setError(null);
    if (
      !window.confirm(
        `نسخه ${toPersianDigits(file.version)} («${file.originalName}») به‌عنوان قرارداد امضاشده تأیید شود؟ با تأیید، پروژه وارد مرحله «در حال انجام» می‌شود و این کار برگشت ندارد.`,
      )
    ) {
      return;
    }
    setBusy(file.id);
    const result = await apiFetch(`${base}/${file.id}/confirm`, {
      method: 'POST',
      body: { note: note.trim() || undefined },
    });
    if (result.ok) {
      // Still busy: the buttons go as soon as the project is read again.
      setConfirmed(true);
      onChanged();
      return;
    }
    setBusy(null);
    setError(result.message);
    reload({ silent: true });
  };

  return (
    <section
      aria-labelledby="contract-title"
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      {heading}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {access.upload ? (
        <>
          <p className="text-sm leading-relaxed text-ink-3">{GUIDANCE[side]}</p>
          <p className="text-[13px] text-ink-3">
            فرمت‌های مجاز: {FILE_TYPES_LABEL} · حداکثر {formatSize(MAX_FILE_BYTES)}. نسخه‌ای که
            دوباره بارگذاری شود نسخه تازه است و نسخه‌های قبلی می‌مانند.
          </p>
        </>
      ) : null}

      {files.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold break-all text-ink-2">{file.originalName}</span>
                  <Tag>نسخه {toPersianDigits(file.version)}</Tag>
                  <Tag>{SIDE_LABELS[file.uploadedAs]}</Tag>
                  {file.confirmedAt ? <Tag>تأییدشده</Tag> : null}
                </span>
                <span className="text-xs text-ink-5">
                  {formatSize(file.size)} · {formatDateFa(file.uploadedAt)}
                  {file.uploadedBy ? ` · ${file.uploadedBy.fullName}` : ''}
                  {file.confirmedAt ? ` · تأیید در ${formatDateFa(file.confirmedAt)}` : ''}
                  {file.confirmedBy ? ` توسط ${file.confirmedBy.fullName}` : ''}
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`دریافت ${file.originalName}`}
                  onClick={() => void download(file)}
                >
                  دریافت
                </Button>
                {access.confirm ? (
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    aria-label={`تأیید نسخه ${toPersianDigits(file.version)} و شروع کار`}
                    onClick={() => void confirm(file)}
                  >
                    {busy === file.id ? 'در حال ثبت…' : 'تأیید و شروع کار'}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-5">هنوز نسخه‌ای از قرارداد بارگذاری نشده است.</p>
      )}

      {access.confirm ? (
        <FieldShell
          id="contract-note"
          label="پیام برای متقاضی (اختیاری)"
          hint="با تأیید قرارداد فرستاده می‌شود؛ متقاضی آن را در روند پروژه و در اعلان می‌خواند."
        >
          <TextArea
            id="contract-note"
            rows={2}
            hasHint
            value={note}
            maxLength={FEASIBILITY_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
          />
        </FieldShell>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {/* Said while the project is where the confirmation took it. */}
      {confirmed && project.status === 'IN_PROGRESS' ? (
        <SuccessMessage>قرارداد تأیید شد و پروژه وارد مرحله «در حال انجام» شد.</SuccessMessage>
      ) : null}
      {access.upload ? (
        <div>
          <input
            ref={input}
            type="file"
            accept={FILE_ACCEPT}
            className="sr-only"
            // The visible button is the control; keep this input out of focus and the a11y tree.
            tabIndex={-1}
            aria-hidden="true"
            disabled={busy !== null}
            onChange={(e) => void upload(e)}
          />
          <Button variant="outline" disabled={busy !== null} onClick={() => input.current?.click()}>
            {busy === 'upload'
              ? 'در حال بارگذاری…'
              : files.length > 0
                ? 'بارگذاری نسخه تازه قرارداد'
                : 'بارگذاری قرارداد امضاشده'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
