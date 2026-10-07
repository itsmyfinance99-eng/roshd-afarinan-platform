'use client';

import {
  Button,
  ErrorMessage,
  FieldShell,
  formatDateTimeFa,
  Notice,
  Select,
  SuccessMessage,
  TextArea,
  toPersianDigits,
} from '@roshd/ui';
import {
  FEASIBILITY_NOTE_MAX,
  MAX_REPORT_CHAPTER_ANSWERS,
  REPORT_CHAPTER_BODY_MAX,
} from '@roshd/validation';
import Link from 'next/link';
import { type FormEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ApprovedRun, DraftChapter, ReportDraft, ReportVersionSummary } from './report-types';
import type { FeasibilityProjectDetail } from './types';

const STANDARD = '';
const NO_RUN = '';

const runLabel = (run: ApprovedRun): string =>
  `اجرای شماره ${toPersianDigits(run.number)} — تأییدشده در ${formatDateTimeFa(run.approvedAt)}`;

const card = 'flex flex-col gap-3 rounded-card border border-line p-4';
const UNSAVED = 'نخست فصل‌هایی را که تغییر ذخیره‌نشده دارند ذخیره کنید:';
/** The chapters whose editor holds a text that was not saved: key and title. */
type Unsaved = RefObject<Map<string, string>>;
/** Why something waits for the unsaved chapters, with their names. */
const unsavedMessage = (unsaved: Unsaved): string =>
  `${UNSAVED} ${[...unsaved.current.values()].map((title) => `«${title}»`).join('، ')}`;
const LEAVE =
  'فصلی از گزارش تغییر ذخیره‌نشده دارد. با رفتن از این صفحه آن تغییر از دست می‌رود. می‌روید؟';
const heading = 'text-base font-extrabold text-brand-900';

/** Starts the report of a project with the chapters of a template or the standard structure. */
function StartReport({
  projectId,
  draft,
  onChanged,
}: {
  projectId: string;
  draft: ReportDraft;
  onChanged: () => void;
}) {
  const [templateId, setTemplateId] = useState(STANDARD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await apiFetch(`/feasibility-projects/${projectId}/report`, {
      method: 'POST',
      body: { templateId: templateId || null },
    });
    setBusy(false);
    if (!result.ok) setError(result.details[0]?.message ?? result.message);
    // Also after a refusal: a colleague may have started the report a moment earlier.
    onChanged();
  };

  if (!draft.access.edit) {
    return (
      <p className="text-[15px] text-ink-5">
        گزارش این پروژه شروع نشده است. گزارش هنگام انجام و بازبینی مطالعه نوشته می‌شود.
      </p>
    );
  }
  return (
    <form method="post" onSubmit={(event) => void start(event)} className={card}>
      <h2 className={heading}>شروع گزارش</h2>
      <p className="text-[15px] leading-relaxed text-ink-5">
        گزارش با فصل‌های یک قالب شروع می‌شود. ساختار استاندارد، فصل‌های راهنمای UNIDO برای مطالعات
        امکان‌سنجی صنعتی و سپس تحلیل اقتصادی است. قالب را بعداً هم می‌توانید عوض کنید.
      </p>
      <FieldShell id="report-template" label="قالب گزارش">
        <Select
          id="report-template"
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
        >
          <option value={STANDARD}>ساختار استاندارد</option>
          {draft.templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </Select>
      </FieldShell>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'در حال شروع…' : 'شروع گزارش'}
        </Button>
      </div>
    </form>
  );
}

/** The structure of the draft: the template it took, and the way to take another one. */
function Structure({
  projectId,
  draft,
  unsaved,
  onChanged,
}: {
  projectId: string;
  draft: ReportDraft;
  unsaved: Unsaved;
  onChanged: () => void;
}) {
  const report = draft.report!;
  /** What the reader chose; until then the select shows the template of the draft. */
  const [choice, setChoice] = useState<string | null>(null);
  const templateId = choice ?? report.template?.id ?? STANDARD;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  // A template that was archived since is still the one the report took.
  const known = draft.templates.some((template) => template.id === report.template?.id);

  const apply = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setApplied(false);
    // A chapter the new structure leaves out would take its unsaved text with it.
    if (unsaved.current.size > 0) {
      setError(unsavedMessage(unsaved));
      return;
    }
    setBusy(true);
    const result = await apiFetch(`/feasibility-projects/${projectId}/report/template`, {
      method: 'PUT',
      body: { templateId: templateId || null },
    });
    setBusy(false);
    if (result.ok) {
      setApplied(true);
      setChoice(null);
    } else setError(result.details[0]?.message ?? result.message);
    onChanged();
  };

  return (
    <section aria-labelledby="structure-title" className={card}>
      <h2 id="structure-title" className={heading}>
        ساختار گزارش
      </h2>
      <p className="text-[15px] text-ink-5">
        قالب کنونی: {report.template?.name ?? 'ساختار استاندارد'}
      </p>
      {draft.access.edit ? (
        <form
          method="post"
          onSubmit={(event) => void apply(event)}
          className="flex flex-wrap items-end gap-3"
        >
          <FieldShell id="structure-template" label="گرفتن فصل‌ها از قالب">
            <Select
              id="structure-template"
              value={templateId}
              onChange={(event) => {
                setChoice(event.target.value);
                setApplied(false);
              }}
            >
              <option value={STANDARD}>ساختار استاندارد</option>
              {report.template && !known ? (
                <option value={report.template.id} disabled>
                  {report.template.name} (بایگانی‌شده)
                </option>
              ) : null}
              {draft.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          </FieldShell>
          <Button type="submit" variant="outline" disabled={busy}>
            {busy ? 'در حال اعمال…' : 'اعمال قالب'}
          </Button>
        </form>
      ) : null}
      <p className="text-[13px] leading-relaxed text-ink-5">
        با اعمال قالب، عنوان و ترتیب فصل‌ها از قالب گرفته می‌شود. متن فصل‌ها می‌ماند؛ فصلی که در
        قالب تازه نیست کنار گذاشته می‌شود و اگر دوباره به ساختار برگردد متنش همراهش است.
      </p>
      {report.excluded.length > 0 ? (
        <div className="text-[15px]">
          <p className="font-bold text-ink">فصل‌های کنارگذاشته</p>
          <ul className="list-disc ps-5 text-ink-3">
            {report.excluded.map((chapter) => (
              <li key={chapter.key}>
                {chapter.title}
                {chapter.hasText ? ' (متن دارد)' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {applied ? <SuccessMessage>ساختار گزارش به‌روز شد.</SuccessMessage> : null}
    </section>
  );
}

/** Which approved calculation run the financial and the economic chapter are built from. */
function RunChoice({
  project,
  draft,
  onChanged,
}: {
  project: FeasibilityProjectDetail;
  draft: ReportDraft;
  onChanged: () => void;
}) {
  const report = draft.report!;
  /** What the reader chose; until then the select shows the run of the draft. */
  const [choice, setChoice] = useState<string | null>(null);
  const runId = choice ?? report.run?.id ?? NO_RUN;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const modelId = project.financialModel?.id;

  const choose = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    const result = await apiFetch(`/feasibility-projects/${project.id}/report/run`, {
      method: 'PUT',
      body: { runId: runId || null },
    });
    setBusy(false);
    if (result.ok) {
      setSaved(true);
      setChoice(null);
    } else setError(result.details.find((d) => d.path === 'runId')?.message ?? result.message);
    onChanged();
  };

  return (
    <section aria-labelledby="run-title" className={card}>
      <h2 id="run-title" className={heading}>
        اجرای محاسبه گزارش
      </h2>
      <p className="text-[15px] leading-relaxed text-ink-5">
        فصل مالی از جدول‌های همین اجرا ساخته می‌شود و اگر اجرا تحلیل اقتصادی داشته باشد، فصل تحلیل
        اقتصادی هم. فقط اجرایی که کارشناس تأیید کرده است در گزارش قرار می‌گیرد.
      </p>
      <p className="text-[15px]">
        اجرای کنونی: {report.run ? runLabel(report.run) : 'انتخاب نشده است'}
      </p>
      {draft.runs.length === 0 ? (
        <Notice>
          مدل مالی این پروژه هنوز اجرای تأییدشده‌ای ندارد.{' '}
          {modelId ? (
            <Link href={`/dashboard/models/${modelId}/runs`} className="font-bold underline">
              اجراهای محاسبه ‹
            </Link>
          ) : (
            'نخست مدل مالی مطالعه را در صفحه پروژه بسازید.'
          )}
        </Notice>
      ) : draft.access.edit ? (
        <form
          method="post"
          onSubmit={(event) => void choose(event)}
          className="flex flex-wrap items-end gap-3"
        >
          <FieldShell id="report-run" label="اجرای تأییدشده">
            <Select
              id="report-run"
              value={runId}
              onChange={(event) => {
                setChoice(event.target.value);
                setSaved(false);
              }}
            >
              <option value={NO_RUN}>بدون اجرا</option>
              {draft.runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {runLabel(run)}
                </option>
              ))}
            </Select>
          </FieldShell>
          <Button type="submit" variant="outline" disabled={busy}>
            {busy ? 'در حال ثبت…' : 'ثبت اجرا'}
          </Button>
        </form>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {saved ? <SuccessMessage>اجرای محاسبه گزارش ثبت شد.</SuccessMessage> : null}
    </section>
  );
}

const sameKeys = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((key, index) => key === b[index]);

/**
 * One chapter of the draft: its text in Markdown and the answers of the questionnaire it
 * quotes. It is saved on its own, on top of the version it was loaded with; when a colleague
 * saved the chapter meanwhile, the save is refused and the newer text can be loaded.
 */
function ChapterEditor({
  projectId,
  chapter,
  index,
  questions,
  editable,
  unsaved,
  onRefused,
}: {
  projectId: string;
  chapter: DraftChapter;
  index: number;
  questions: ReportDraft['questions'];
  editable: boolean;
  unsaved: Unsaved;
  /** A save was refused for a reason of the draft as a whole: the page reads it again. */
  onRefused: () => void;
}) {
  const [stored, setStored] = useState(chapter);
  const [body, setBody] = useState(chapter.body);
  const [answerKeys, setAnswerKeys] = useState(chapter.answerKeys);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = body !== stored.body || !sameKeys(answerKeys, stored.answerKeys);
  const id = `chapter-${chapter.key}`;

  // A text that was not saved is not lost by closing the page without a question.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The forms beside this one ask whether a chapter still holds unsaved text.
  useEffect(() => {
    const keys = unsaved.current;
    if (dirty) keys.set(chapter.key, chapter.title);
    else keys.delete(chapter.key);
    return () => void keys.delete(chapter.key);
  }, [dirty, chapter.key, chapter.title, unsaved]);

  const take = (next: DraftChapter) => {
    setStored(next);
    setBody(next.body);
    setAnswerKeys(next.answerKeys);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const result = await apiFetch<DraftChapter>(
        `/feasibility-projects/${projectId}/report/chapters/${chapter.key}`,
        { method: 'PUT', body: { version: stored.version, body, answerKeys } },
      );
      if (result.ok) {
        // What was typed while the request was on its way stays in the field.
        setStored(result.data);
        setStale(false);
        setSaved(true);
        return;
      }
      if (result.status === 409) {
        // Refused on top of an older version, or because the draft is closed: the chapter as
        // it is stored now tells the two apart.
        const now = await apiFetch<ReportDraft>(`/feasibility-projects/${projectId}/report`);
        const fresh = now.ok
          ? now.data.report?.chapters.find((item) => item.key === chapter.key)
          : undefined;
        if (fresh && fresh.version !== stored.version) {
          setStale(true);
          setError(
            'همکار دیگری این فصل را ذخیره کرده است. اگر متن خود را لازم دارید آن را جایی نگه دارید، سپس نسخه تازه فصل را بارگذاری کنید.',
          );
          return;
        }
        onRefused();
      }
      setStale(false);
      setError(result.details[0]?.message ?? result.message);
    } finally {
      setBusy(false);
    }
  };

  /** Drops what is in the field and loads the chapter as it is stored now. */
  const reloadChapter = async () => {
    setError(null);
    setBusy(true);
    const result = await apiFetch<ReportDraft>(`/feasibility-projects/${projectId}/report`);
    setBusy(false);
    const fresh = result.ok
      ? result.data.report?.chapters.find((item) => item.key === chapter.key)
      : undefined;
    if (!fresh) {
      setError(result.ok ? 'این فصل دیگر در ساختار گزارش نیست.' : result.message);
      return;
    }
    take(fresh);
    setStale(false);
  };

  const toggle = (key: string) => {
    setSaved(false);
    setAnswerKeys((keys) =>
      keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key],
    );
  };

  return (
    <form
      method="post"
      aria-labelledby={id}
      onSubmit={(event) => void save(event)}
      className={card}
    >
      <h3 id={id} className={heading}>
        {toPersianDigits(index + 1)}. {chapter.title}
      </h3>
      {chapter.kind === 'financial' ? (
        <p className="text-[13px] leading-relaxed text-ink-5">
          جدول‌های این فصل از اجرای محاسبه گزارش می‌آید. متنی که اینجا می‌نویسید (مثلاً تفسیر نتایج)
          پیش از جدول‌ها می‌آید و اختیاری است.
        </p>
      ) : chapter.kind === 'economic' ? (
        <p className="text-[13px] leading-relaxed text-ink-5">
          اگر اجرای محاسبه گزارش تحلیل اقتصادی داشته باشد، جدول‌های آن در این فصل می‌آید. اگر نه
          تحلیل اقتصادی باشد و نه متنی، این فصل از گزارش کنار گذاشته می‌شود.
        </p>
      ) : null}
      {chapter.guidance ? (
        <Notice>
          <span className="font-bold">راهنمای فصل: </span>
          <span className="whitespace-pre-line">{chapter.guidance}</span>
        </Notice>
      ) : null}
      <FieldShell
        id={`${id}-body`}
        label={`متن فصل «${chapter.title}»`}
        hint="متن را به Markdown بنویسید؛ عنوان، متن پررنگ و فهرست در گزارش شکل می‌گیرند."
      >
        <TextArea
          id={`${id}-body`}
          rows={10}
          dir="auto"
          hasHint
          value={body}
          readOnly={!editable}
          maxLength={REPORT_CHAPTER_BODY_MAX}
          onChange={(event) => {
            setBody(event.target.value);
            setSaved(false);
          }}
        />
      </FieldShell>
      {questions.length > 0 ? (
        <details className="text-[15px]">
          <summary className="cursor-pointer font-bold text-ink">
            پاسخ‌های منتخب پرسشنامه ({toPersianDigits(answerKeys.length)} از حداکثر{' '}
            {toPersianDigits(MAX_REPORT_CHAPTER_ANSWERS)})
          </summary>
          <fieldset className="mt-2 flex flex-col gap-1.5" disabled={!editable}>
            <legend className="sr-only">پاسخ‌هایی که در فصل «{chapter.title}» می‌آید</legend>
            {questions.map((question) => {
              const checked = answerKeys.includes(question.key);
              return (
                <label key={question.key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1.5"
                    checked={checked}
                    disabled={!checked && answerKeys.length >= MAX_REPORT_CHAPTER_ANSWERS}
                    onChange={() => toggle(question.key)}
                  />
                  <span>
                    {question.label}
                    {question.answered ? null : (
                      <span className="text-[13px] text-ink-5"> (بی‌پاسخ)</span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
        </details>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {saved && !dirty ? <SuccessMessage>فصل ذخیره شد.</SuccessMessage> : null}
      <div className="flex flex-wrap items-center gap-3">
        {editable ? (
          <Button type="submit" disabled={busy || !dirty}>
            {busy ? 'در حال ذخیره…' : 'ذخیره فصل'}
          </Button>
        ) : null}
        {stale ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void reloadChapter()}
          >
            کنار گذاشتن متن من و بارگذاری نسخه تازه
          </Button>
        ) : null}
        <p className="text-[13px] text-ink-5" aria-live="polite">
          {dirty ? 'تغییر ذخیره‌نشده دارد. ' : ''}
          {stored.updatedBy
            ? `آخرین ذخیره: ${stored.updatedBy.fullName}، ${formatDateTimeFa(stored.updatedAt)}`
            : 'هنوز چیزی در این فصل ذخیره نشده است.'}
        </p>
      </div>
    </form>
  );
}

/** Issues the draft as the next version, and says what is still missing when it is refused. */
function IssueVersion({
  projectId,
  unsaved,
  onIssued,
}: {
  projectId: string;
  unsaved: Unsaved;
  onIssued: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [issued, setIssued] = useState<number | null>(null);

  const issue = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMissing([]);
    setIssued(null);
    // A version is written from what is stored, not from what is in the fields.
    if (unsaved.current.size > 0) {
      setError(unsavedMessage(unsaved));
      return;
    }
    setBusy(true);
    const result = await apiFetch<ReportVersionSummary>(
      `/feasibility-projects/${projectId}/report/versions`,
      { method: 'POST', body: { note } },
    );
    setBusy(false);
    if (result.ok) {
      setNote('');
      setIssued(result.data.number);
      onIssued();
      return;
    }
    setError(result.message);
    setMissing(result.details.map((detail) => detail.message));
  };

  return (
    <form
      method="post"
      aria-labelledby="issue-title"
      onSubmit={(event) => void issue(event)}
      className={card}
    >
      <h2 id="issue-title" className={heading}>
        صدور نسخه
      </h2>
      <p className="text-[15px] leading-relaxed text-ink-5">
        با صدور، پیش‌نویس همان‌گونه که ذخیره شده است به‌صورت نسخه‌ای شماره‌دار ثبت می‌شود. نسخه
        صادرشده دیگر تغییر نمی‌کند؛ پیش‌نویس می‌ماند و اصلاح بعدی نسخه بعدی می‌شود. پیش از صدور،
        فصل‌ها را ذخیره کنید.
      </p>
      <p className="text-[15px]">
        <Link
          href={`/dashboard/manage/feasibility/${projectId}/report/preview`}
          target="_blank"
          rel="noopener"
        >
          پیش‌نمایش گزارش و کمبودهای آن (در زبانه تازه) ‹
        </Link>
      </p>
      <FieldShell
        id="issue-note"
        label="یادداشت این نسخه (اختیاری)"
        hint="چه چیزی در این نسخه تغییر کرده است. متقاضی این یادداشت را نمی‌بیند."
      >
        <TextArea
          id="issue-note"
          rows={2}
          hasHint
          value={note}
          maxLength={FEASIBILITY_NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
        />
      </FieldShell>
      {error ? (
        <ErrorMessage>
          {error}
          {missing.length > 0 ? (
            <ul className="mt-1 list-disc ps-5">
              {missing.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          ) : null}
        </ErrorMessage>
      ) : null}
      {issued !== null ? (
        <SuccessMessage>نسخه {toPersianDigits(issued)} گزارش صادر شد.</SuccessMessage>
      ) : null}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'در حال صدور…' : 'صدور نسخه تازه'}
        </Button>
      </div>
    </form>
  );
}

/**
 * The draft of the report of a study (ST-35.12) as its staff and its assigned experts write it:
 * the structure, the calculation run, the chapters and the issue of a version.
 */
export function ReportComposer({
  project,
  draft,
  onChanged,
  onIssued,
}: {
  project: FeasibilityProjectDetail;
  draft: ReportDraft;
  /** The draft changed in a way the page reads again (structure, run). */
  onChanged: () => void;
  onIssued: () => void;
}) {
  const unsaved = useRef(new Map<string, string>());

  // A link of the dashboard leaves the page without loading another document, so the browser
  // does not ask on its own: with unsaved text, the reader is asked here.
  useEffect(() => {
    const ask = (event: MouseEvent) => {
      if (unsaved.current.size === 0 || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link || link.getAttribute('target') === '_blank') return;
      if (link.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm(LEAVE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', ask, true);
    return () => document.removeEventListener('click', ask, true);
  }, []);
  const report = draft.report;
  if (!report) return <StartReport projectId={project.id} draft={draft} onChanged={onChanged} />;
  return (
    <div className="flex flex-col gap-6">
      {draft.access.edit ? null : (
        <Notice>
          این پروژه در مرحله‌ای نیست که گزارش آن نوشته شود؛ پیش‌نویس فقط خوانده می‌شود.
        </Notice>
      )}
      <Structure projectId={project.id} draft={draft} unsaved={unsaved} onChanged={onChanged} />
      <RunChoice project={project} draft={draft} onChanged={onChanged} />
      <section aria-labelledby="chapters-title" className="flex flex-col gap-4">
        <h2 id="chapters-title" className={heading}>
          فصل‌های گزارش
        </h2>
        {report.chapters.map((chapter, index) => (
          <ChapterEditor
            key={chapter.key}
            projectId={project.id}
            chapter={chapter}
            index={index}
            questions={draft.questions}
            editable={draft.access.edit}
            unsaved={unsaved}
            onRefused={onChanged}
          />
        ))}
      </section>
      {draft.access.issue ? (
        <IssueVersion projectId={project.id} unsaved={unsaved} onIssued={onIssued} />
      ) : null}
    </div>
  );
}

/** The versions a report was issued in, newest first, each opened on its own page. */
export function ReportVersions({
  projectId,
  versions,
}: {
  projectId: string;
  versions: ReportVersionSummary[];
}) {
  return (
    <section aria-labelledby="versions-title" className="flex flex-col gap-3">
      <h2 id="versions-title" className={heading}>
        نسخه‌های صادرشده
      </h2>
      {versions.length === 0 ? (
        <p className="text-[15px] text-ink-5">هنوز نسخه‌ای از این گزارش صادر نشده است.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {versions.map((version) => (
            <li key={version.number} className="rounded-card border border-line p-4 text-[15px]">
              <Link
                href={`/dashboard/manage/feasibility/${projectId}/report/versions/${version.number}`}
                className="font-bold"
              >
                نسخه {toPersianDigits(version.number)} ‹
              </Link>
              <p className="mt-1 text-[13px] text-ink-5">
                {version.issuedBy?.fullName ?? 'کاربر حذف‌شده'} ·{' '}
                {formatDateTimeFa(version.createdAt)}
              </p>
              {version.note ? (
                <p className="mt-1 leading-relaxed whitespace-pre-line">{version.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
