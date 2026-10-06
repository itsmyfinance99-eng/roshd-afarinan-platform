'use client';

import {
  Button,
  DemoBadge,
  EmptyState,
  ErrorMessage,
  FieldShell,
  Notice,
  Select,
  Tag,
  TextArea,
  TextInput,
  toPersianDigits,
} from '@roshd/ui';
import {
  addProjectQuestionnaireItemSchema,
  PROJECT_ITEM_KIND_LABELS_FA,
  PROJECT_NOTE_MAX,
  type AnswerValue,
  type ProjectItemKind,
  type Question,
} from '@roshd/validation';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  checkDrafts,
  completeIssues,
  errorsFromDetails,
  firstOpenStep,
  hasOwnStep,
  progressOf,
  questionOfPath,
  stepsOf,
  type Draft,
  type ProjectItem,
  type ProjectQuestionnaire,
  type Step,
} from './answers';
import { ProjectDocuments } from '@/components/feasibility/documents';
import { AnswerField } from './fields';

const SAVE_DELAY_MS = 1200;

/** How often a save that the network or the server lost is tried again by itself. */
const MAX_RETRIES = 4;
/** Browsers cut a request that outlives its page at about 64 KiB; stay well below. */
const KEEPALIVE_LIMIT = 60_000;

/** Who reads the form: its applicant, or staff and experts who review it. */
export type QuestionnaireViewer = 'applicant' | 'staff';

/** Where an item came from, in the words of who reads it. */
const ORIGIN_LABELS: Record<QuestionnaireViewer, Record<ProjectItem['origin'], string>> = {
  applicant: { applicant: 'افزوده شما', staff: 'افزوده کارشناسان' },
  staff: { applicant: 'افزوده متقاضی', staff: 'افزوده کارشناسان' },
};

/** Which simple questions the applicant may add to their own project. */
const OWN_QUESTION_TYPES = [
  ['long_text', 'پاسخ متنی'],
  ['number', 'پاسخ عددی'],
] as const;

function AddItemForm({
  base,
  before,
  viewer,
  onAdded,
}: {
  base: string;
  viewer: QuestionnaireViewer;
  /** Sends what the form still holds, so that the answer of the server is about all of it. */
  before: () => Promise<void>;
  onAdded: (next: ProjectQuestionnaire) => void;
}) {
  const [kind, setKind] = useState<ProjectItemKind>('NOTE');
  const [text, setText] = useState('');
  const [type, setType] = useState<(typeof OWN_QUESTION_TYPES)[number][0]>('long_text');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body =
      kind === 'NOTE'
        ? { kind, text }
        : kind === 'DOCUMENT'
          ? { kind, document: { label: text } }
          : { kind, question: { type, label: text } };
    const parsed = addProjectQuestionnaireItemSchema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setBusy(true);
    await before();
    const result = await apiFetch<ProjectQuestionnaire>(`${base}/items`, {
      method: 'POST',
      body,
    });
    setBusy(false);
    if (result.ok) {
      setText('');
      onAdded(result.data);
    } else {
      setError(result.details[0]?.message ?? result.message);
    }
  };

  return (
    <form
      method="post"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-labelledby="add-item-title"
      className="flex flex-col gap-3 rounded-panel border border-line-strong bg-surface p-4"
    >
      <h3 id="add-item-title" className="text-base font-extrabold text-brand-900">
        افزودن مورد اختصاصی
      </h3>
      <p className="text-sm text-ink-3">
        {viewer === 'staff'
          ? 'سؤال، مدرک یا توضیحی را که برای بررسی این پروژه لازم است به پرسشنامه آن اضافه کنید؛ متقاضی از آن باخبر می‌شود.'
          : 'اگر نکته، سؤال یا مدرکی دارید که در پرسشنامه نیامده است، آن را به پروژه خودتان اضافه کنید.'}
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3">
        <FieldShell id="item-kind" label="نوع مورد">
          <Select
            id="item-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProjectItemKind)}
          >
            {(['NOTE', 'QUESTION', 'DOCUMENT'] as const).map((value) => (
              <option key={value} value={value}>
                {PROJECT_ITEM_KIND_LABELS_FA[value]}
              </option>
            ))}
          </Select>
        </FieldShell>
        {kind === 'QUESTION' ? (
          <FieldShell id="item-type" label="نوع پاسخ">
            <Select
              id="item-type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {OWN_QUESTION_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FieldShell>
        ) : null}
      </div>
      <FieldShell
        id="item-text"
        label={kind === 'NOTE' ? 'متن توضیح' : kind === 'QUESTION' ? 'متن سؤال' : 'عنوان مدرک'}
        required
        error={error}
      >
        {kind === 'NOTE' ? (
          <TextArea
            id="item-text"
            rows={3}
            value={text}
            maxLength={PROJECT_NOTE_MAX}
            error={error}
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          <TextInput
            id="item-text"
            value={text}
            maxLength={300}
            error={error}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </FieldShell>
      <div>
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? 'در حال افزودن…' : 'افزودن'}
        </Button>
      </div>
    </form>
  );
}

function ItemHeader({
  item,
  viewer,
  onRemove,
}: {
  item: ProjectItem;
  viewer: QuestionnaireViewer;
  onRemove?: () => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <span className="flex flex-wrap items-center gap-2">
        <Tag>{PROJECT_ITEM_KIND_LABELS_FA[item.kind]}</Tag>
        <span className="text-[13px] text-ink-5">{ORIGIN_LABELS[viewer][item.origin]}</span>
      </span>
      {onRemove ? (
        <Button variant="ghost" size="sm" onClick={onRemove}>
          حذف این مورد
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The questionnaire of a project as a form in steps (ST-35.05): one step per section and a last
 * one for what belongs to this project only.
 *
 * Saving. An answer is queued when it changes and sent a moment later, alone or with the others
 * that changed. What does not fit its question is not sent: it stays in the form with its
 * message until it is corrected. A queued answer leaves the queue only when the server has it,
 * so one that was typed while a request was on its way, or that the network lost, is sent again;
 * and what is still queued when the page is left goes out with a last request.
 *
 * With `access.answer` false (after the submission, or for a reader) nothing can be changed.
 */
export function QuestionnaireForm({
  projectId,
  questionnaire,
  onQuestionnaire,
  checkOnOpen = false,
  viewer = 'applicant',
}: {
  projectId: string;
  /** What the server holds; the page owns it, so that starting the questionnaire keeps the form. */
  questionnaire: ProjectQuestionnaire;
  onQuestionnaire: (questionnaire: ProjectQuestionnaire) => void;
  /** Opened from a refused submission: say at once what is still open. */
  checkOnOpen?: boolean;
  /** Staff and experts read the answers and never write them; the wording follows. */
  viewer?: QuestionnaireViewer;
}) {
  const base = `/feasibility-projects/${projectId}/questionnaire`;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => ({
    ...questionnaire.answers,
  }));
  // Opened from a refused submission: what is still open is marked from the start.
  const [errors, setErrors] = useState<Record<string, string>>(() =>
    checkOnOpen && questionnaire.access.answer
      ? completeIssues(
          stepsOf(questionnaire, true).flatMap((item) => item.questions),
          questionnaire.answers,
        )
      : {},
  );
  /** Answers that wait to be sent, and whether a request is on its way. */
  const [unsent, setUnsent] = useState(0);
  const [saving, setSaving] = useState(false);
  /** The last request failed for a reason that is not about an answer (network, server). */
  const [failure, setFailure] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  /** What the last check for completeness found, until something changes. */
  const [verdict, setVerdict] = useState<'complete' | 'open' | null>(null);

  const readOnly = !questionnaire.access.answer;
  const withOwn = hasOwnStep(questionnaire);
  const steps = useMemo(() => stepsOf(questionnaire, withOwn), [questionnaire, withOwn]);
  const questions = useMemo(() => steps.flatMap((step) => step.questions), [steps]);
  const [current, setCurrent] = useState(() =>
    Math.max(0, firstOpenStep(stepsOf(questionnaire, withOwn), questionnaire.answers, errors)),
  );
  const step: Step | undefined = steps[Math.min(current, steps.length - 1)];
  const heading = useRef<HTMLHeadingElement>(null);

  // The queue and what it reads live outside of rendering: a save runs when its timer fires.
  const queue = useRef({
    drafts,
    questions,
    /** Per queued question: the number of its last change, to tell whether a sent answer is still the last. */
    dirty: new Map<string, number>(),
    /** Never repeats, so an old answer of the server cannot be taken for a newer change. */
    sequence: 0,
    /** The save that is on its way, for whoever must wait for it. */
    inflight: null as Promise<void> | null,
    /** What the server said last, for what must read it before the next rendering. */
    latest: questionnaire,
    retries: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    gone: false,
  });
  useEffect(() => {
    queue.current.questions = questions;
    queue.current.latest = questionnaire;
  }, [questions, questionnaire]);

  /** Takes over what the server answered. */
  const accept = useCallback(
    (next: ProjectQuestionnaire) => {
      queue.current.latest = next;
      onQuestionnaire(next);
    },
    [onQuestionnaire],
  );

  const refresh = useCallback(async (): Promise<ProjectQuestionnaire | null> => {
    const result = await apiFetch<ProjectQuestionnaire>(base);
    if (!result.ok) return null;
    accept(result.data);
    return result.data;
  }, [accept, base]);

  const flushRef = useRef<() => Promise<void>>(async () => {});
  const schedule = useCallback((delay: number) => {
    const q = queue.current;
    clearTimeout(q.timer);
    q.timer = setTimeout(() => void flushRef.current(), delay);
  }, []);

  /** One request with what is queued and valid; what is not valid waits for its correction. */
  const send = useCallback(async () => {
    const q = queue.current;
    if (q.dirty.size === 0) return;
    const sent = new Map(q.dirty);
    const checked = checkDrafts(q.questions, q.drafts, sent.keys());
    const wrong = new Set(Object.keys(checked.errors).map(questionOfPath));
    // A wrong answer is out of the queue until it is changed again.
    for (const key of sent.keys()) {
      if (wrong.has(key) || !(key in checked.valid)) q.dirty.delete(key);
    }
    setErrors((old) => ({
      ...Object.fromEntries(
        Object.entries(old).filter(([path]) => !sent.has(questionOfPath(path))),
      ),
      ...checked.errors,
    }));
    setUnsent(q.dirty.size);
    if (Object.keys(checked.valid).length === 0) return;

    setSaving(true);
    const result = await apiFetch<ProjectQuestionnaire>(`${base}/answers`, {
      method: 'PUT',
      body: { answers: checked.valid },
    }).finally(() => {
      // Whatever comes of the request, the form does not stay "saving".
      if (!q.gone) setSaving(false);
    });
    if (q.gone) return;
    /** Out of the queue, unless it was changed again while the request was on its way. */
    const settle = (key: string) => {
      if (q.dirty.get(key) === sent.get(key)) q.dirty.delete(key);
    };
    const fromApi = result.ok ? {} : errorsFromDetails(result.details);

    if (result.ok) {
      for (const key of Object.keys(checked.valid)) settle(key);
      q.retries = 0;
      setFailure(null);
      accept(result.data);
    } else if (result.status === 400 && Object.keys(fromApi).length > 0) {
      // The whole request was refused for the answers the details name; the others go again.
      for (const path of Object.keys(fromApi)) settle(questionOfPath(path));
      setErrors((old) => ({ ...old, ...fromApi }));
      setFailure(null);
      // A question may be gone (the staff removed it): show what there is now.
      void refresh();
    } else if (result.status === 409 || result.status === 403 || result.status === 404) {
      // The project was submitted or is no longer the caller's: nothing more can be saved, and
      // what was not saved is not shown as if it were.
      q.dirty.clear();
      setFailure(result.message);
      const now = await refresh();
      if (now && !q.gone) {
        q.drafts = { ...now.answers };
        setDrafts(q.drafts);
        setErrors({});
      }
    } else {
      // The network, the server, or a refusal that names no answer: the answers stay queued and
      // are tried again, a few times.
      q.retries += 1;
      setFailure(result.message);
      setUnsent(q.dirty.size);
      if (q.retries <= MAX_RETRIES) schedule(Math.min(30_000, 2000 * 2 ** (q.retries - 1)));
      return;
    }
    setUnsent(q.dirty.size);
    if (q.dirty.size > 0) schedule(300);
  }, [accept, base, refresh, schedule]);

  /**
   * Sends what is queued. Whoever awaits it also awaits a save that was already on its way, so
   * that afterwards the server has seen everything that was typed before.
   */
  const flush = useCallback(async () => {
    const q = queue.current;
    clearTimeout(q.timer);
    while (q.inflight) await q.inflight;
    const run = send().finally(() => {
      if (q.inflight === run) q.inflight = null;
    });
    q.inflight = run;
    await run;
  }, [send]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Leaving the page: what is queued and valid goes out with a last request.
  useEffect(() => {
    const q = queue.current;
    const last = (unloading: boolean) => {
      clearTimeout(q.timer);
      if (q.dirty.size === 0) return;
      const checked = checkDrafts(q.questions, q.drafts, q.dirty.keys());
      if (Object.keys(checked.valid).length === 0) return;
      const body = { answers: checked.valid };
      void apiFetch(`${base}/answers`, {
        method: 'PUT',
        body,
        // Only a page that is really going away needs the request to outlive it, and such a
        // request may not be large; a larger one is sent the usual way and may be cut off.
        // The limit is in bytes, and Persian text takes two for a letter.
        keepalive:
          unloading && new TextEncoder().encode(JSON.stringify(body)).length < KEEPALIVE_LIMIT,
      });
    };
    // The queue is left as it is: if the page comes back, the answers are simply sent again.
    const hide = () => last(true);
    const hidden = () => {
      if (document.visibilityState === 'hidden') void flushRef.current();
    };
    // Back from the browser's cache: what the server has may be newer than what is shown.
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted) void flushRef.current().then(() => refresh());
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', shown);
    document.addEventListener('visibilitychange', hidden);
    q.gone = false;
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', shown);
      document.removeEventListener('visibilitychange', hidden);
      q.gone = true;
      // Inside the app the page lives on, so an ordinary request is enough and has no limit.
      last(false);
    };
  }, [base, refresh]);

  // Closing the page while something is not saved yet asks first.
  useEffect(() => {
    if (unsent === 0 && !saving) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsent, saving]);

  const change = (key: string, draft: Draft) => {
    const q = queue.current;
    q.drafts = { ...q.drafts, [key]: draft };
    q.sequence += 1;
    q.dirty.set(key, q.sequence);
    q.retries = 0;
    setDrafts(q.drafts);
    // Its old messages were about what it was; the new value is checked when it is saved.
    setErrors((old) =>
      Object.fromEntries(Object.entries(old).filter(([path]) => questionOfPath(path) !== key)),
    );
    setUnsent(q.dirty.size);
    setTouched(true);
    setFailure(null);
    setVerdict(null);
    schedule(SAVE_DELAY_MS);
  };

  const focusHeading = () => requestAnimationFrame(() => heading.current?.focus());

  const go = (index: number) => {
    void flush();
    setCurrent(index);
    // The new step is read from its title on.
    focusHeading();
  };

  /** Says what a submission would still ask for, and opens the first step that has some. */
  const checkComplete = () => {
    // What the server said last, which after a save is ahead of what was rendered.
    const now = queue.current.latest;
    const nowSteps = stepsOf(now, hasOwnStep(now));
    const open = completeIssues(
      nowSteps.flatMap((item) => item.questions),
      now.answers,
    );
    setErrors(open);
    const first = firstOpenStep(nowSteps, now.answers, open);
    const documentsOpen = now.missingDocuments.length > 0;
    // Missing documents are handed in in the last step; it opens when nothing comes before it.
    if (first >= 0) setCurrent(first);
    else if (documentsOpen) setCurrent(nowSteps.length - 1);
    setVerdict(Object.keys(open).length === 0 && !documentsOpen ? 'complete' : 'open');
    focusHeading();
  };

  const removeItem = async (item: ProjectItem) => {
    if (!window.confirm('این مورد و پاسخ آن حذف شود؟')) return;
    setItemError(null);
    // What is queued goes first, so that the answer of the server is about all of it.
    await flush();
    const result = await apiFetch<ProjectQuestionnaire>(`${base}/items/${item.id}`, {
      method: 'DELETE',
    });
    if (result.ok) {
      queue.current.dirty.delete(item.key);
      setUnsent(queue.current.dirty.size);
      setErrors((old) =>
        Object.fromEntries(
          Object.entries(old).filter(([path]) => questionOfPath(path) !== item.key),
        ),
      );
      accept(result.data);
      focusHeading();
    } else setItemError(result.message);
  };

  const saved: Record<string, AnswerValue> = questionnaire.answers;
  const overall = progressOf(questions, saved);

  if (steps.length === 0 || !step) {
    return (
      <EmptyState
        title="این پروژه پرسشنامه‌ای ندارد"
        description="هنوز پرسشنامه‌ای برای این پروژه شروع نشده و مورد اختصاصی هم ندارد."
      />
    );
  }

  const index = steps.indexOf(step);
  /** A file question shows the files the server has; everything else what the form holds. */
  const draftOf = (question: Question): Draft =>
    question.type === 'file' ? questionnaire.answers[question.key] : drafts[question.key];
  const missingDocuments = questionnaire.missingDocuments.length;
  const documentsLine =
    missingDocuments > 0
      ? `${toPersianDigits(missingDocuments)} مدرک الزامی بارگذاری نشده است.`
      : null;
  const known = new Set(questions.map((question) => question.key));
  // A message about a question that is gone (the staff removed it) is nobody's to fix.
  const wrong = new Set(
    Object.keys(errors)
      .map(questionOfPath)
      .filter((key) => known.has(key)),
  );
  /** What the line under the form says; only its settled states are announced. */
  const settled = failure
    ? null
    : wrong.size > 0
      ? `${toPersianDigits(wrong.size)} پاسخ نیاز به اصلاح یا تکمیل دارد.${
          verdict !== null && documentsLine ? ` ${documentsLine}` : ''
        }`
      : verdict !== null && documentsLine
        ? documentsLine
        : verdict === 'complete' && unsent === 0
          ? 'پرسشنامه کامل است.'
          : touched
            ? 'همه تغییرها ذخیره شد.'
            : 'پاسخ‌ها خودکار ذخیره می‌شوند.';
  const busyLine = saving
    ? 'در حال ذخیره…'
    : unsent > 0 && !failure
      ? 'تغییرها ذخیره نشده است…'
      : null;

  return (
    <div
      className="flex flex-col gap-6"
      // Leaving a field sends what is queued, so little is ever waiting.
      onBlur={(event) => {
        // A tick among several is not the whole answer yet; the others are on their way.
        if ((event.target as HTMLElement).getAttribute('type') === 'checkbox') return;
        if (queue.current.dirty.size > 0 && !failure) schedule(150);
      }}
    >
      {questionnaire.template ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
          {questionnaire.template.title}
          <span>· نسخه {toPersianDigits(questionnaire.template.version)}</span>
          {questionnaire.template.isDemo ? <DemoBadge size="sm" /> : null}
        </p>
      ) : null}
      {readOnly ? (
        <Notice>
          {viewer === 'staff'
            ? 'پاسخ‌های متقاضی را می‌خوانید؛ فقط متقاضی آن‌ها را تغییر می‌دهد.'
            : 'پاسخ‌ها در این مرحله قفل است و فقط خوانده می‌شود. اگر کارشناسان اطلاعات تکمیلی بخواهند، پرسشنامه دوباره باز می‌شود.'}
        </Notice>
      ) : null}

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-ink">
            {toPersianDigits(overall.answered)} از {toPersianDigits(overall.total)} سؤال پاسخ داده
            شده
          </span>
          {overall.missing > 0 ? (
            <span className="text-ink-3">
              {toPersianDigits(overall.missing)} سؤال الزامی مانده است
            </span>
          ) : null}
          {missingDocuments > 0 ? (
            <span className="text-ink-3">
              {toPersianDigits(missingDocuments)} مدرک الزامی مانده است
            </span>
          ) : null}
        </div>
        <progress
          aria-label="پیشرفت پرسشنامه"
          className="block h-2 w-full overflow-hidden rounded-full accent-[var(--color-primary)]"
          max={Math.max(overall.total, 1)}
          value={overall.answered}
        />
      </div>

      <nav aria-label="مراحل پرسشنامه">
        <ol className="flex flex-wrap gap-2">
          {steps.map((item, i) => {
            const progress = progressOf(item.questions, saved);
            const hasError =
              item.questions.some((question) => wrong.has(question.key)) ||
              // After a check the step of the documents says that some are still missing.
              (item.own === true && verdict !== null && missingDocuments > 0);
            return (
              <li key={item.key}>
                <Button
                  variant={i === index ? 'primary' : 'outline'}
                  size="sm"
                  aria-current={i === index ? 'step' : undefined}
                  onClick={() => go(i)}
                >
                  {toPersianDigits(i + 1)}. {item.title}
                  {hasError ? (
                    <span className="ms-1">· خطا</span>
                  ) : progress.answered > 0 &&
                    progress.missing === 0 &&
                    !(item.own && missingDocuments > 0) ? (
                    <span className="ms-1" aria-label="کامل">
                      ✓
                    </span>
                  ) : null}
                </Button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-labelledby="step-title" className="flex flex-col gap-5">
        <div>
          <h2
            id="step-title"
            ref={heading}
            tabIndex={-1}
            className="text-xl font-extrabold text-brand-900 outline-none"
          >
            {step.title}
          </h2>
          {step.description ? (
            <p className="mt-1 text-[15px] whitespace-pre-line text-ink-3">{step.description}</p>
          ) : null}
        </div>

        {step.own ? (
          <>
            {/* Handing in a file changes the answer of its file question on the server. */}
            <ProjectDocuments
              projectId={projectId}
              revision={questionnaire.items.length}
              onChanged={() => void refresh()}
              emptyText="این پرسشنامه مدرک یا فایلی برای بارگذاری نمی‌خواهد."
            />
            <h3 className="text-base font-extrabold text-brand-900">موارد اختصاصی پروژه</h3>
            {questionnaire.items.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {questionnaire.items.map((item) => (
                  <li key={item.id} className="rounded-panel border border-line-strong p-4">
                    <ItemHeader
                      item={item}
                      viewer={viewer}
                      onRemove={item.removable ? () => void removeItem(item) : undefined}
                    />
                    {item.kind === 'NOTE' ? (
                      <p className="text-[15px] whitespace-pre-line">{item.text}</p>
                    ) : item.kind === 'DOCUMENT' ? (
                      <p className="text-[15px]">
                        {item.document.label}
                        {item.document.required ? (
                          <span className="ms-1 text-danger">*</span>
                        ) : null}
                      </p>
                    ) : (
                      <AnswerField
                        question={item.question}
                        draft={draftOf(item.question)}
                        errors={errors}
                        disabled={readOnly}
                        onChange={(draft) => change(item.question.key, draft)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-ink-5">هنوز مورد اختصاصی‌ای افزوده نشده است.</p>
            )}
            {itemError ? <ErrorMessage>{itemError}</ErrorMessage> : null}
            {questionnaire.access.addItems ? (
              <AddItemForm base={base} before={flush} viewer={viewer} onAdded={accept} />
            ) : null}
          </>
        ) : step.questions.length === 0 ? (
          <p className="text-[15px] text-ink-5">این بخش سؤالی ندارد.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {step.questions.map((question) => (
              <AnswerField
                key={question.key}
                question={question}
                draft={draftOf(question)}
                errors={errors}
                disabled={readOnly}
                onChange={(draft) => change(question.key, draft)}
              />
            ))}
          </div>
        )}
      </section>

      {readOnly ? (
        failure ? (
          <ErrorMessage>{failure}</ErrorMessage>
        ) : null
      ) : (
        <div className="min-h-6 text-sm text-ink-3">
          {/* What is still moving is shown and not spoken; what has settled is spoken once. */}
          {busyLine ? <p>{busyLine}</p> : null}
          <p role="status" aria-live="polite" className={busyLine ? 'sr-only' : undefined}>
            {busyLine ? '' : (settled ?? '')}
          </p>
          {failure ? (
            <p role="alert" className="text-danger">
              {failure}
              {unsent > 0 ? ' پاسخ‌های ذخیره‌نشده در فرم مانده‌اند.' : ''}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={index === 0} onClick={() => go(index - 1)}>
          مرحله قبل
        </Button>
        <Button disabled={index === steps.length - 1} onClick={() => go(index + 1)}>
          مرحله بعد
        </Button>
        {readOnly ? null : (
          <Button
            variant="ghost"
            onClick={() => {
              // What was just typed is part of what is checked.
              void flush().then(checkComplete);
            }}
          >
            بررسی کامل بودن پرسشنامه
          </Button>
        )}
        {failure && unsent > 0 && !readOnly ? (
          <Button
            variant="ghost"
            onClick={() => {
              queue.current.retries = 0;
              void flush();
            }}
          >
            تلاش دوباره برای ذخیره
          </Button>
        ) : null}
      </div>
    </div>
  );
}
