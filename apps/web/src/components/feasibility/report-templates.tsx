'use client';

import {
  Button,
  EmptyState,
  ErrorMessage,
  FieldShell,
  formatDateFa,
  SuccessMessage,
  Tag,
  TextArea,
  TextInput,
  toPersianDigits,
} from '@roshd/ui';
import {
  createReportTemplateSchema,
  DEFAULT_REPORT_STRUCTURE,
  FEASIBILITY_REVIEW_SECTION_LABELS_FA,
  REPORT_CHAPTER_GUIDANCE_MAX,
  REPORT_CHAPTER_TITLE_MAX,
  type FeasibilityReportChapterKey,
} from '@roshd/validation';
import { type FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ReportTemplate } from './report-types';

interface Row {
  key: FeasibilityReportChapterKey;
  included: boolean;
  title: string;
  guidance: string;
}

/** The chapters of a template first, in its order; then the ones it leaves out. */
function rowsOf(template: ReportTemplate | null): Row[] {
  const chosen = template?.chapters ?? DEFAULT_REPORT_STRUCTURE;
  const keys = new Set(chosen.map((chapter) => chapter.key));
  return [
    ...chosen.map((chapter) => ({
      key: chapter.key,
      included: true,
      title: chapter.title,
      guidance: chapter.guidance ?? '',
    })),
    ...DEFAULT_REPORT_STRUCTURE.filter((chapter) => !keys.has(chapter.key)).map((chapter) => ({
      key: chapter.key,
      included: false,
      title: chapter.title,
      guidance: '',
    })),
  ];
}

/**
 * The form of a report template (ST-35.12): its name and, for every chapter a report can have,
 * whether the template has it, under which title, with what guidance and in which place.
 */
export function ReportTemplateForm({
  template,
  onSaved,
  onCancel,
}: {
  /** `null` for a new template. */
  template: ReportTemplate | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [rows, setRows] = useState(() => rowsOf(template));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [moved, setMoved] = useState('');

  const change = (index: number, patch: Partial<Row>) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row!);
    setRows(next);
    setMoved(`«${row!.title}» به جایگاه ${toPersianDigits(target + 1)} رفت.`);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNameError(undefined);
    const parsed = createReportTemplateSchema.safeParse({
      name,
      chapters: rows
        .filter((row) => row.included)
        .map(({ key, title, guidance }) => ({ key, title, ...(guidance ? { guidance } : {}) })),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === 'name') {
        setNameError(issue.message);
        document.getElementById('template-name')?.focus();
      } else {
        setError(issue?.message ?? 'فصل‌های قالب را کامل کنید.');
      }
      return;
    }
    setBusy(true);
    const result = await apiFetch(
      template ? `/report-templates/${template.id}` : '/report-templates',
      {
        method: template ? 'PATCH' : 'POST',
        body: parsed.data,
      },
    );
    setBusy(false);
    if (result.ok) onSaved();
    else setError(result.details[0]?.message ?? result.message);
  };

  return (
    <form
      method="post"
      aria-labelledby="template-form-title"
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4 rounded-card border border-line p-4"
    >
      <h2 id="template-form-title" className="text-base font-extrabold text-brand-900">
        {template ? `ویرایش قالب «${template.name}»` : 'قالب تازه'}
      </h2>
      <FieldShell id="template-name" label="نام قالب" required error={nameError}>
        <TextInput
          id="template-name"
          value={name}
          maxLength={150}
          error={nameError}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
        />
      </FieldShell>
      <p className="text-[13px] leading-relaxed text-ink-5">
        فصل‌ها از ساختار راهنمای UNIDO و تحلیل اقتصادی انتخاب می‌شوند. فصل «تحلیل مالی» از جدول‌های
        اجرای تأییدشده مدل مالی ساخته می‌شود. گزارشی که پیش‌تر شروع شده با تغییر قالب عوض نمی‌شود.
      </p>
      <ol className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const usual = FEASIBILITY_REVIEW_SECTION_LABELS_FA[row.key];
          const id = `template-chapter-${row.key}`;
          return (
            <li key={row.key} className="flex flex-col gap-3 rounded-card border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[15px] font-bold text-ink">
                  <input
                    type="checkbox"
                    checked={row.included}
                    onChange={(event) => change(index, { included: event.target.checked })}
                  />
                  {usual}
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === 0}
                    aria-label={`بالا بردن فصل «${usual}»`}
                    onClick={() => move(index, -1)}
                  >
                    بالا
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === rows.length - 1}
                    aria-label={`پایین بردن فصل «${usual}»`}
                    onClick={() => move(index, 1)}
                  >
                    پایین
                  </Button>
                </div>
              </div>
              {row.included ? (
                <>
                  <FieldShell id={`${id}-title`} label={`عنوان فصل «${usual}» در گزارش`}>
                    <TextInput
                      id={`${id}-title`}
                      value={row.title}
                      maxLength={REPORT_CHAPTER_TITLE_MAX}
                      onChange={(event) => change(index, { title: event.target.value })}
                    />
                  </FieldShell>
                  <FieldShell
                    id={`${id}-guidance`}
                    label={`راهنمای کارشناس برای فصل «${usual}» (اختیاری)`}
                  >
                    <TextArea
                      id={`${id}-guidance`}
                      rows={2}
                      value={row.guidance}
                      maxLength={REPORT_CHAPTER_GUIDANCE_MAX}
                      onChange={(event) => change(index, { guidance: event.target.value })}
                    />
                  </FieldShell>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {moved}
      </p>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'در حال ذخیره…' : 'ذخیره قالب'}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          انصراف
        </Button>
      </div>
    </form>
  );
}

/** The report templates of the staff with the way to change and to archive each. */
export function ReportTemplateList({
  templates,
  onEdit,
  onChanged,
}: {
  templates: ReportTemplate[];
  onEdit: (template: ReportTemplate) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const archive = async (template: ReportTemplate, archived: boolean) => {
    setError(null);
    setDone(null);
    setBusy(template.id);
    const result = await apiFetch(`/report-templates/${template.id}`, {
      method: 'PATCH',
      body: { archived },
    });
    setBusy(null);
    if (result.ok) {
      setDone(
        archived
          ? `قالب «${template.name}» بایگانی شد.`
          : `قالب «${template.name}» دوباره فعال شد.`,
      );
    } else setError(result.message);
    onChanged();
  };

  if (templates.length === 0) {
    return (
      <EmptyState
        title="قالبی ساخته نشده است"
        description="تا هنگامی که قالبی نسازید، گزارش‌ها با ساختار استاندارد (فصل‌های راهنمای UNIDO و تحلیل اقتصادی) شروع می‌شوند."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {done ? <SuccessMessage>{done}</SuccessMessage> : null}
      <ul className="flex flex-col gap-3">
        {templates.map((template) => (
          <li key={template.id} className="flex flex-col gap-2 rounded-card border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold text-ink">
                {template.name}
                {template.archivedAt ? <Tag className="ms-2">بایگانی‌شده</Tag> : null}
              </h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`ویرایش قالب «${template.name}»`}
                  onClick={() => onEdit(template)}
                >
                  ویرایش
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === template.id}
                  aria-label={`${template.archivedAt ? 'فعال‌کردن' : 'بایگانی'} قالب «${template.name}»`}
                  onClick={() => void archive(template, template.archivedAt === null)}
                >
                  {template.archivedAt ? 'فعال‌کردن' : 'بایگانی'}
                </Button>
              </div>
            </div>
            <p className="text-[13px] text-ink-5">
              {toPersianDigits(template.chapters.length)} فصل · آخرین تغییر{' '}
              {formatDateFa(template.updatedAt)}
            </p>
            <ol className="list-decimal ps-5 text-[15px] text-ink-3">
              {template.chapters.map((chapter) => (
                <li key={chapter.key}>{chapter.title}</li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </div>
  );
}
