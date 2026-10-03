'use client';

import {
  Button,
  cn,
  EmptyState,
  ErrorMessage,
  FieldShell,
  formatDateTimeFa,
  TextInput,
  toPersianDigits,
} from '@roshd/ui';
import type { FinancialModelScope } from '@roshd/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { useMe } from '@/components/dashboard/me-context';
import { AsyncBoundary, Pagination } from '@/components/dashboard/ui';
import { apiFetch } from '@/lib/api-client';
import { emptyDraft } from '@/lib/model-editor/draft-ops';
import { useApi } from '@/lib/use-api';
import type { FinancialModelDetail, FinancialModelSummary } from './types';

const PAGE_SIZE = 20;

const SCOPE_LABELS_FA: Record<FinancialModelScope, string> = {
  mine: 'مدل‌های من',
  assigned: 'ارجاع‌شده به من',
  all: 'همه مدل‌ها',
};

/** The caller's financial models (and, for staff, the assigned ones and all), with a create form. */
export function ModelList() {
  const me = useMe();
  const scopes: FinancialModelScope[] = [
    'mine',
    ...(me.permissions.includes('financial-models:work') ? (['assigned'] as const) : []),
    ...(me.permissions.includes('financial-models:manage') ? (['all'] as const) : []),
  ];
  const [scope, setScope] = useState<FinancialModelScope>('mine');
  const [page, setPage] = useState(1);
  const { state, reload } = useApi<FinancialModelSummary[]>(
    `/financial-models?scope=${scope}&page=${page}&pageSize=${PAGE_SIZE}`,
  );

  return (
    <div className="flex flex-col gap-6">
      <NewModel />
      {scopes.length > 1 ? (
        <div role="group" aria-label="دامنه فهرست" className="flex flex-wrap gap-2">
          {scopes.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === scope}
              onClick={() => {
                setScope(option);
                setPage(1);
              }}
              className={cn(
                'rounded-chip border px-3 py-1.5 text-sm font-bold',
                option === scope
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-line-strong text-ink',
              )}
            >
              {SCOPE_LABELS_FA[option]}
            </button>
          ))}
        </div>
      ) : null}
      <AsyncBoundary state={state} reload={reload}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState
              title="هنوز مدلی ساخته نشده است"
              description="با یک عنوان، مدل تازه‌ای بسازید و ورودی‌های آن را بخش به بخش وارد کنید."
            />
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {items.map((model) => (
                  <li key={model.id}>
                    <Link
                      href={`/dashboard/models/${model.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4 text-ink no-underline hover:border-line-hover hover:text-ink"
                    >
                      <span className="text-[15px] font-bold">{model.title}</span>
                      <span className="text-[13px] text-ink-5">
                        آخرین تغییر {formatDateTimeFa(model.updatedAt)} · نسخه{' '}
                        {toPersianDigits(model.version)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={state.status === 'success' ? (state.meta?.total ?? items.length) : 0}
                onChange={setPage}
              />
            </>
          )
        }
      </AsyncBoundary>
    </div>
  );
}

function NewModel() {
  const router = useRouter();
  const id = useId();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 3) {
      setError('عنوان مدل حداقل سه نویسه است.');
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await apiFetch<FinancialModelDetail>('/financial-models', {
      method: 'POST',
      body: { title: title.trim(), inputs: emptyDraft() },
    });
    if (result.ok) {
      router.push(`/dashboard/models/${result.data.id}`);
      return;
    }
    setBusy(false);
    setError(result.details[0]?.message ?? result.message);
  };

  return (
    <form
      method="post"
      onSubmit={(event) => void create(event)}
      className="grid items-end gap-3 rounded-card border border-line p-4 md:grid-cols-[1fr_auto]"
    >
      <FieldShell id={id} label="عنوان مدل تازه" required>
        <TextInput
          id={id}
          maxLength={150}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </FieldShell>
      <Button type="submit" size="xl" disabled={busy}>
        {busy ? 'در حال ساخت…' : 'ساخت مدل'}
      </Button>
      {error ? <ErrorMessage className="md:col-span-2">{error}</ErrorMessage> : null}
    </form>
  );
}
