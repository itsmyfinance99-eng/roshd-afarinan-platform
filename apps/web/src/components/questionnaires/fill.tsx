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
  errorsFromDetails,
  firstOpenStep,
  progressOf,
  questionOfPath,
  stepsOf,
  type Draft,
  type ProjectItem,
  type ProjectQuestionnaire,
  type Step,
} from './answers';
import { AnswerField } from './fields';

const SAVE_DELAY_MS = 1200;

type SaveState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string };

const SAVE_LABELS: Record<Exclude<SaveState['status'], 'error' | 'idle'>, string> = {
  pending: 'تغییرها ذخیره نشده است…',
  saving: 'در حال ذخیره…',
  saved: 'همه تغییرها ذخیره شد.',
};

const ORIGIN_LABELS = { applicant: 'افزوده شما', staff: 'افزوده کارشناسان' } as const;

/** Which simple questions the applicant may add to their own project. */
const OWN_QUESTION_TYPES = [
  ['long_text', 'پاسخ متنی'],
  ['number', 'پاسخ عددی'],
] as const;

function AddItemForm({
  base,
  onAdded,
}: {
  base: string;
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
        اگر نکته، سؤال یا مدرکی دارید که در پرسشنامه نیامده است، آن را به پروژه خودتان اضافه کنید.
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

function ItemHeader({ item, onRemove }: { item: ProjectItem; onRemove?: () => void }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <span className="flex flex-wrap items-center gap-2">
        <Tag>{PROJECT_ITEM_KIND_LABELS_FA[item.kind]}</Tag>
        <span className="text-[13px] text-ink-5">{ORIGIN_LABELS[item.origin]}</span>
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
 * one for what belongs to this project only. Answers are saved on their own a moment after
 * they change; what does not fit its question stays in the form with its message and is not
 * sent. With `readOnly` (after the submission, or for a reader) nothing can be changed.
 */
export function QuestionnaireForm({
  projectId,
  initial,
  onChanged,
}: {
  projectId: string;
  initial: ProjectQuestionnaire;
  /** The saved state changed (progress, items); the page around may want to know. */
  onChanged?: (questionnaire: ProjectQuestionnaire) => void;
}) {
  const base = `/feasibility-projects/${projectId}/questionnaire`;
  const [questionnaire, setQuestionnaire] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => ({ ...initial.answers }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const [itemError, setItemError] = useState<string | null>(null);
  const dirty = useRef(new Set<string>());
  const saving = useRef(false);
  const draftsRef = useRef(drafts);

  const readOnly = !questionnaire.access.answer;
  const withOwn = questionnaire.items.length > 0 || questionnaire.access.addItems;
  const steps = useMemo(() => stepsOf(questionnaire, withOwn), [questionnaire, withOwn]);
  const questions = useMemo(() => steps.flatMap((step) => step.questions), [steps]);
  const questionsRef = useRef<Question[]>(questions);
  // What a save reads is what is on the screen when it runs, not when it was scheduled.
  useEffect(() => {
    draftsRef.current = drafts;
    questionsRef.current = questions;
  }, [drafts, questions]);
  const [current, setCurrent] = useState(() =>
    Math.max(0, firstOpenStep(stepsOf(initial, withOwn), initial.answers, {})),
  );
  const step: Step | undefined = steps[Math.min(current, steps.length - 1)];
  const heading = useRef<HTMLHeadingElement>(null);

  const accept = useCallback(
    (next: ProjectQuestionnaire) => {
      setQuestionnaire(next);
      onChanged?.(next);
    },
    [onChanged],
  );

  /** Sends the answers that changed and are valid; the others wait for their correction. */
  const flush = useCallback(async () => {
    if (saving.current || dirty.current.size === 0) return;
    const keys = [...dirty.current];
    const checked = checkDrafts(questionsRef.current, draftsRef.current, keys);
    setErrors((old) => {
      const next = Object.fromEntries(
        Object.entries(old).filter(([path]) => !keys.includes(questionOfPath(path))),
      );
      return { ...next, ...checked.errors };
    });
    const sendable = Object.keys(checked.valid);
    for (const key of keys) dirty.current.delete(key);
    if (sendable.length === 0) {
      setSave(
        Object.keys(checked.errors).length > 0
          ? { status: 'error', message: 'پاسخ‌های نادرست ذخیره نشد؛ آن‌ها را اصلاح کنید.' }
          : { status: 'saved' },
      );
      return;
    }
    saving.current = true;
    setSave({ status: 'saving' });
    const result = await apiFetch<ProjectQuestionnaire>(`${base}/answers`, {
      method: 'PUT',
      body: { answers: checked.valid },
    });
    saving.current = false;
    if (result.ok) {
      accept(result.data);
      setSave(
        Object.keys(checked.errors).length > 0
          ? { status: 'error', message: 'پاسخ‌های نادرست ذخیره نشد؛ آن‌ها را اصلاح کنید.' }
          : dirty.current.size > 0
            ? { status: 'pending' }
            : { status: 'saved' },
      );
    } else {
      const fromApi = errorsFromDetails(result.details);
      setErrors((old) => ({ ...old, ...fromApi }));
      // What the API refused for a reason of its own stays to be sent again.
      if (Object.keys(fromApi).length === 0) for (const key of sendable) dirty.current.add(key);
      setSave({ status: 'error', message: result.message });
    }
  }, [accept, base]);

  // Saves a moment after the last change.
  useEffect(() => {
    if (save.status !== 'pending') return;
    const timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [save, drafts, flush]);

  // Leaving with unsaved answers asks first.
  useEffect(() => {
    if (save.status !== 'pending' && save.status !== 'saving') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save.status]);

  const change = (key: string, draft: Draft) => {
    setDrafts((old) => ({ ...old, [key]: draft }));
    dirty.current.add(key);
    setSave({ status: 'pending' });
  };

  const go = (index: number) => {
    void flush();
    setCurrent(index);
    // The new step is read from its title on.
    requestAnimationFrame(() => heading.current?.focus());
  };

  const removeItem = async (item: ProjectItem) => {
    if (!window.confirm('این مورد و پاسخ آن حذف شود؟')) return;
    setItemError(null);
    const result = await apiFetch<ProjectQuestionnaire>(`${base}/items/${item.id}`, {
      method: 'DELETE',
    });
    if (result.ok) accept(result.data);
    else setItemError(result.message);
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
  const wrong = new Set(Object.keys(errors).map(questionOfPath));

  return (
    <div className="flex flex-col gap-6">
      {questionnaire.template ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
          {questionnaire.template.title}
          <span>· نسخه {toPersianDigits(questionnaire.template.version)}</span>
          {questionnaire.template.isDemo ? <DemoBadge size="sm" /> : null}
        </p>
      ) : null}
      {readOnly ? (
        <Notice>
          پاسخ‌ها در این مرحله قفل است و فقط خوانده می‌شود. اگر کارشناسان اطلاعات تکمیلی بخواهند،
          پرسشنامه دوباره باز می‌شود.
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
            const hasError = item.questions.some((question) => wrong.has(question.key));
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
                  ) : progress.total > 0 && progress.missing === 0 ? (
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
            {questionnaire.definition?.documents.length ? (
              <div>
                <h3 className="mb-2 text-base font-extrabold text-brand-900">مدارک پرسشنامه</h3>
                <ul className="flex list-disc flex-col gap-1.5 ps-5 text-[15px]">
                  {questionnaire.definition.documents.map((document) => (
                    <li key={document.key}>
                      {document.label}
                      {document.required ? <span className="ms-1 text-danger">*</span> : null}
                      {document.help ? (
                        <span className="block text-[13px] text-ink-3">{document.help}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[13px] text-ink-3">
                  بارگذاری مدارک در بخش مدارک پروژه انجام می‌شود.
                </p>
              </div>
            ) : null}
            {questionnaire.items.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {questionnaire.items.map((item) => (
                  <li key={item.id} className="rounded-panel border border-line-strong p-4">
                    <ItemHeader
                      item={item}
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
                        draft={drafts[item.question.key]}
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
            {questionnaire.access.addItems ? <AddItemForm base={base} onAdded={accept} /> : null}
          </>
        ) : step.questions.length === 0 ? (
          <p className="text-[15px] text-ink-5">این بخش سؤالی ندارد.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {step.questions.map((question) => (
              <AnswerField
                key={question.key}
                question={question}
                draft={drafts[question.key]}
                errors={errors}
                disabled={readOnly}
                onChange={(draft) => change(question.key, draft)}
              />
            ))}
          </div>
        )}
      </section>

      {readOnly ? null : (
        <p role="status" aria-live="polite" className="min-h-6 text-sm text-ink-3">
          {save.status === 'error' ? (
            <span className="text-danger">{save.message}</span>
          ) : save.status === 'idle' ? (
            'پاسخ‌ها خودکار ذخیره می‌شوند.'
          ) : (
            SAVE_LABELS[save.status]
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={index === 0} onClick={() => go(index - 1)}>
          مرحله قبل
        </Button>
        <Button disabled={index === steps.length - 1} onClick={() => go(index + 1)}>
          مرحله بعد
        </Button>
        {save.status === 'error' && !readOnly ? (
          <Button
            variant="ghost"
            onClick={() => {
              for (const question of step.questions) dirty.current.add(question.key);
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
