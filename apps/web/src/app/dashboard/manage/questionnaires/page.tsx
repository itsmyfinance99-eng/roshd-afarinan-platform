'use client';

import {
  Button,
  ChipGroup,
  DemoBadge,
  EmptyState,
  ErrorMessage,
  FieldShell,
  formatDateFa,
  Select,
  Tag,
  TextInput,
  toPersianDigits,
} from '@roshd/ui';
import { createQuestionnaireTemplateSchema, FEASIBILITY_SECTORS } from '@roshd/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import type {
  QuestionnaireTemplateDetail,
  QuestionnaireTemplateItem,
} from '@/components/questionnaires/types';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 20;
type State = 'active' | 'archived';
const STATE_LABELS: Record<State, string> = { active: 'قالب‌های فعال', archived: 'بایگانی' };

/** In which state the versions of a template are, in a few words. */
function versionSummary(template: QuestionnaireTemplateItem): string {
  const parts = [
    template.published
      ? `نسخه ${toPersianDigits(template.published.version)} منتشر شده`
      : 'هنوز منتشر نشده',
    ...(template.draft ? [`پیش‌نویس نسخه ${toPersianDigits(template.draft.version)}`] : []),
  ];
  return parts.join(' · ');
}

function NewTemplateForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [sector, setSector] = useState('');
  const [busy, setBusy] = useState(false);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = createQuestionnaireTemplateSchema.safeParse({ title, sector: sector || null });
    if (!parsed.success) {
      setTitleError(parsed.error.issues.find((issue) => issue.path[0] === 'title')?.message);
      return;
    }
    setTitleError(undefined);
    setBusy(true);
    const result = await apiFetch<QuestionnaireTemplateDetail>('/questionnaire-templates', {
      method: 'POST',
      body: parsed.data,
    });
    if (result.ok) {
      router.push(`/dashboard/manage/questionnaires/${result.data.id}`);
      return;
    }
    setBusy(false);
    setTitleError(result.details.find((detail) => detail.path === 'title')?.message);
    setError(result.message);
  };

  return (
    <form
      method="post"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-labelledby="new-template-title"
      className="mb-8 flex max-w-2xl flex-col gap-4 rounded-panel border border-line-strong bg-surface p-5"
    >
      <h2 id="new-template-title" className="text-base font-extrabold text-brand-900">
        قالب تازه
      </h2>
      <FieldShell id="qt-title" label="عنوان قالب" required error={titleError}>
        <TextInput
          id="qt-title"
          value={title}
          maxLength={200}
          error={titleError}
          onChange={(e) => setTitle(e.target.value)}
        />
      </FieldShell>
      <FieldShell
        id="qt-sector"
        label="حوزه طرح"
        hint="قالب عمومی به پروژه‌های حوزه‌هایی داده می‌شود که قالب خودشان را ندارند."
      >
        <Select id="qt-sector" hasHint value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">عمومی (همه حوزه‌ها)</option>
          {FEASIBILITY_SECTORS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </FieldShell>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'در حال ساخت…' : 'ساخت قالب'}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          انصراف
        </Button>
      </div>
    </form>
  );
}

export default function QuestionnaireTemplatesPage() {
  const allowed = useCan('feasibility:manage');
  const [state, setState] = useState<State>('active');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { state: list, reload } = useApi<QuestionnaireTemplateItem[]>(
    allowed ? `/questionnaire-templates?state=${state}&page=${page}&pageSize=${PAGE_SIZE}` : null,
  );

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="قالب‌های پرسشنامه"
        action={creating ? null : <Button onClick={() => setCreating(true)}>قالب تازه</Button>}
      />
      {creating ? <NewTemplateForm onCancel={() => setCreating(false)} /> : null}
      <div className="mb-6">
        <ChipGroup
          label="وضعیت قالب‌ها"
          options={(Object.keys(STATE_LABELS) as State[]).map((value) => ({
            value,
            label: STATE_LABELS[value],
          }))}
          value={state}
          onChange={(value) => {
            setState(value);
            setPage(1);
          }}
        />
      </div>
      <AsyncBoundary state={list} reload={reload}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState
              title={state === 'archived' ? 'قالبی در بایگانی نیست' : 'هنوز قالبی ساخته نشده است'}
              description={
                state === 'archived'
                  ? 'قالب‌هایی که بایگانی می‌شوند اینجا می‌مانند.'
                  : 'پرسشنامه هر حوزه را اینجا بسازید و منتشر کنید تا متقاضیان آن را پر کنند.'
              }
            />
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {items.map((template) => (
                  <li key={template.id}>
                    <Link
                      href={`/dashboard/manage/questionnaires/${template.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line-strong bg-surface p-4 no-underline transition-colors hover:border-line-hover"
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-ink">{template.title}</span>
                          {template.isDemo ? <DemoBadge size="sm" /> : null}
                        </span>
                        <span className="text-[13px] text-ink-3">{versionSummary(template)}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-5">
                        <Tag>{template.sector ?? 'عمومی'}</Tag>
                        <span>به‌روزرسانی {formatDateFa(template.updatedAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {list.status === 'success' ? (
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={list.meta?.total ?? items.length}
                  onChange={setPage}
                />
              ) : null}
            </>
          )
        }
      </AsyncBoundary>
    </>
  );
}
