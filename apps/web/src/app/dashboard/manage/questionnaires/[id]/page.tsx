'use client';

import {
  Button,
  ChipGroup,
  DemoBadge,
  ErrorMessage,
  FieldShell,
  formatDateFa,
  Notice,
  Select,
  SuccessMessage,
  Tag,
  TextInput,
  toPersianDigits,
} from '@roshd/ui';
import {
  FEASIBILITY_SECTORS,
  questionnaireDefinitionSchema,
  updateQuestionnaireTemplateSchema,
  type QuestionnaireDefinition,
} from '@roshd/validation';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { describeIssuePath, EMPTY_DEFINITION } from '@/components/questionnaires/definition-ops';
import { DefinitionEditor } from '@/components/questionnaires/editor';
import { QuestionnairePreview } from '@/components/questionnaires/preview';
import type { QuestionnaireTemplateDetail } from '@/components/questionnaires/types';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

type View = 'edit' | 'preview' | 'versions';
const VIEW_LABELS: Record<View, string> = {
  edit: 'ویرایش',
  preview: 'پیش‌نمایش',
  versions: 'نسخه‌ها',
};

interface Problem {
  where: string;
  message: string;
}

/** The content the editor starts from: the draft, else the published version to correct. */
const startingPoint = (template: QuestionnaireTemplateDetail): QuestionnaireDefinition =>
  template.draftDefinition ?? template.publishedDefinition ?? EMPTY_DEFINITION;

function Settings({
  template,
  onSaved,
}: {
  template: QuestionnaireTemplateDetail;
  onSaved: (template: QuestionnaireTemplateDetail) => void;
}) {
  const [title, setTitle] = useState(template.title);
  const [sector, setSector] = useState(template.sector ?? '');
  const [busy, setBusy] = useState(false);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const archived = template.archivedAt !== null;

  const send = async (body: Record<string, unknown>) => {
    setError(null);
    setBusy(true);
    const result = await apiFetch<QuestionnaireTemplateDetail>(
      `/questionnaire-templates/${template.id}`,
      { method: 'PATCH', body },
    );
    setBusy(false);
    if (result.ok) onSaved(result.data);
    else {
      setTitleError(result.details.find((detail) => detail.path === 'title')?.message);
      setError(result.message);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = updateQuestionnaireTemplateSchema.safeParse({ title, sector: sector || null });
    if (!parsed.success) {
      setTitleError(parsed.error.issues.find((issue) => issue.path[0] === 'title')?.message);
      return;
    }
    setTitleError(undefined);
    void send(parsed.data);
  };

  return (
    <form
      method="post"
      onSubmit={submit}
      noValidate
      aria-label="مشخصات قالب"
      className="flex flex-col gap-4 rounded-panel border border-line-strong bg-surface p-5"
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4">
        <FieldShell id="qt-title" label="عنوان قالب" required error={titleError}>
          <TextInput
            id="qt-title"
            value={title}
            maxLength={200}
            error={titleError}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FieldShell>
        <FieldShell id="qt-sector" label="حوزه طرح">
          <Select id="qt-sector" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">عمومی (همه حوزه‌ها)</option>
            {FEASIBILITY_SECTORS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </FieldShell>
      </div>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="outline" disabled={busy}>
          ذخیره مشخصات
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (
              !archived &&
              !window.confirm(
                'قالب بایگانی شود؟ پروژه‌های تازه دیگر با آن شروع نمی‌شوند؛ پروژه‌های شروع‌شده آن را نگه می‌دارند.',
              )
            ) {
              return;
            }
            void send({ archived: !archived });
          }}
        >
          {archived ? 'بازگرداندن از بایگانی' : 'بایگانی قالب'}
        </Button>
      </div>
    </form>
  );
}

function Versions({ template }: { template: QuestionnaireTemplateDetail }) {
  return (
    <ul className="flex flex-col gap-2">
      {template.versions.map((version) => (
        <li
          key={version.version}
          className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line-strong bg-surface p-4 text-[15px]"
        >
          <span className="flex items-center gap-2 font-bold text-ink">
            نسخه {toPersianDigits(version.version)}
            <Tag>{version.status === 'PUBLISHED' ? 'منتشرشده' : 'پیش‌نویس'}</Tag>
          </span>
          <span className="text-[13px] text-ink-3">
            {version.publishedAt
              ? `انتشار ${formatDateFa(version.publishedAt)}${
                  version.publishedBy ? ` · ${version.publishedBy.fullName}` : ''
                }`
              : `آخرین تغییر ${formatDateFa(version.updatedAt)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Workspace({ initial }: { initial: QuestionnaireTemplateDetail }) {
  const [template, setTemplate] = useState(initial);
  const [definition, setDefinition] = useState(() => startingPoint(initial));
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<View>('edit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const archived = template.archivedAt !== null;
  const base = `/questionnaire-templates/${template.id}`;

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const accept = (next: QuestionnaireTemplateDetail, message: string) => {
    setTemplate(next);
    setDefinition(startingPoint(next));
    setDirty(false);
    setProblems([]);
    setSuccess(message);
  };

  const fail = (
    result: { message: string; details: { path: string; message: string }[] },
    current: QuestionnaireDefinition,
  ) => {
    setError(result.message);
    setProblems(
      result.details.map((detail) => ({
        where: describeIssuePath(
          detail.path
            .split('.')
            .slice(1)
            .map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
          current,
        ),
        message: detail.message,
      })),
    );
  };

  /** Saves the draft; `false` when it could not be saved. */
  const save = async (): Promise<boolean> => {
    setError(null);
    setSuccess(null);
    const parsed = questionnaireDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      setError('پرسشنامه ایراد دارد و ذخیره نشد.');
      setProblems(
        parsed.error.issues.map((issue) => ({
          where: describeIssuePath(issue.path, definition),
          message: issue.message,
        })),
      );
      return false;
    }
    setBusy(true);
    const result = await apiFetch<QuestionnaireTemplateDetail>(`${base}/draft`, {
      method: 'PUT',
      body: { definition: parsed.data },
    });
    setBusy(false);
    if (!result.ok) {
      fail(result, definition);
      return false;
    }
    accept(result.data, 'پیش‌نویس ذخیره شد.');
    return true;
  };

  const publish = async () => {
    if (dirty && !(await save())) return;
    const version = toPersianDigits(
      template.draft?.version ?? (template.published?.version ?? 0) + 1,
    );
    if (
      !window.confirm(
        `نسخه ${version} منتشر شود؟ نسخه منتشرشده دیگر تغییر نمی‌کند و پروژه‌های تازه با آن شروع می‌شوند.`,
      )
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    const result = await apiFetch<QuestionnaireTemplateDetail>(`${base}/publish`, {
      method: 'POST',
      body: {},
    });
    setBusy(false);
    if (result.ok) accept(result.data, `نسخه ${version} منتشر شد.`);
    else fail(result, definition);
  };

  const discard = async () => {
    if (!window.confirm('پیش‌نویس کنار گذاشته شود؟ تغییرهای آن از بین می‌رود.')) return;
    setError(null);
    setBusy(true);
    const result = await apiFetch<QuestionnaireTemplateDetail>(`${base}/draft`, {
      method: 'DELETE',
    });
    setBusy(false);
    if (result.ok) accept(result.data, 'پیش‌نویس کنار گذاشته شد.');
    else fail(result, definition);
  };

  const hasDraft = template.draft !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-extrabold text-brand-900">{template.title}</h2>
        {template.isDemo ? <DemoBadge /> : null}
        <Tag>{template.sector ?? 'عمومی'}</Tag>
        {archived ? <Tag>بایگانی‌شده</Tag> : null}
      </div>
      <p className="text-sm text-ink-3">
        {template.published
          ? `نسخه ${toPersianDigits(template.published.version)} منتشر شده است`
          : 'هنوز نسخه‌ای منتشر نشده است'}
        {template.draft
          ? ` · پیش‌نویس نسخه ${toPersianDigits(template.draft.version)} در دست ویرایش است`
          : ''}
        {dirty ? ' · تغییرهای ذخیره‌نشده دارید' : ''}
      </p>

      <Settings
        key={`${template.title}|${template.sector}|${template.archivedAt}`}
        template={template}
        onSaved={(next) => {
          // The content being edited stays; only the facts of the template changed.
          setTemplate(next);
          setSuccess('مشخصات قالب ذخیره شد.');
        }}
      />

      {archived ? (
        <Notice>
          این قالب بایگانی شده است و تا وقتی از بایگانی بیرون نیاید ویرایش و منتشر نمی‌شود.
        </Notice>
      ) : null}

      <ChipGroup
        label="نمای قالب"
        options={(Object.keys(VIEW_LABELS) as View[]).map((value) => ({
          value,
          label: VIEW_LABELS[value],
        }))}
        value={view}
        onChange={setView}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {view === 'edit' ? (
        <fieldset disabled={archived || busy} className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">محتوای پرسشنامه</legend>
          <DefinitionEditor
            definition={definition}
            onChange={(next) => {
              setDefinition(next);
              setDirty(true);
              setSuccess(null);
            }}
            announce={setAnnouncement}
          />
        </fieldset>
      ) : null}
      {view === 'preview' ? <QuestionnairePreview definition={definition} /> : null}
      {view === 'versions' ? <Versions template={template} /> : null}

      {error ? (
        <ErrorMessage>
          {error}
          {problems.length > 0 ? (
            <ul className="mt-2 list-disc ps-5">
              {problems.map((problem, i) => (
                <li key={i}>
                  {problem.where}: {problem.message}
                </li>
              ))}
            </ul>
          ) : null}
        </ErrorMessage>
      ) : null}
      {success ? <SuccessMessage>{success}</SuccessMessage> : null}

      {archived ? null : (
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? 'در حال ذخیره…' : 'ذخیره پیش‌نویس'}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || (!hasDraft && !dirty)}
            onClick={() => void publish()}
          >
            انتشار نسخه
          </Button>
          {hasDraft && template.published ? (
            <Button variant="ghost" disabled={busy} onClick={() => void discard()}>
              کنار گذاشتن پیش‌نویس
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** A questionnaire template: its facts, its content in the editor, a preview and its versions. */
export default function QuestionnaireTemplatePage() {
  const { id } = useParams<{ id: string }>();
  const allowed = useCan('feasibility:manage');
  const { state, reload } = useApi<QuestionnaireTemplateDetail>(
    allowed ? `/questionnaire-templates/${encodeURIComponent(id)}` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="قالب پرسشنامه"
        action={
          <Link href="/dashboard/manage/questionnaires" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(template) => <Workspace key={template.id} initial={template} />}
      </AsyncBoundary>
    </>
  );
}
