'use client';

import {
  Button,
  EmptyState,
  ErrorMessage,
  FieldShell,
  formatDateTimeFa,
  JalaliDateInput,
  Select,
  TextInput,
} from '@roshd/ui';
import { AUDIT_ACTION_GROUPS, AUDIT_ACTION_LABELS_FA } from '@roshd/validation';
import { type FormEvent, useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import { useApi } from '@/lib/use-api';

interface AuditItem {
  id: string;
  action: string;
  actor: { id: string; fullName: string; email: string } | null;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  requestId: string | null;
  createdAt: string;
}

interface Filters {
  action: string;
  actor: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { action: '', actor: '', from: '', to: '' };
const PAGE_SIZE = 30;

function metadataText(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const entries = Object.entries(metadata as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ');
}

/** Read-only audit trail for admins (`audit:read`); secrets are redacted by the API. */
export default function AuditLogPage() {
  const allowed = useCan('audit:read');
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const rangeInvalid = Boolean(draft.from && draft.to && draft.from > draft.to);

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value.trim());
  const { state, reload } = useApi<AuditItem[]>(allowed ? `/audit-logs?${query.toString()}` : null);

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  const apply = (event: FormEvent) => {
    event.preventDefault();
    if (rangeInvalid) return;
    setFilters(draft);
    setPage(1);
  };
  const set = (key: keyof Filters, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <>
      <PageTitle title="گزارش رویدادها (Audit)" />
      <form
        method="get"
        role="search"
        onSubmit={apply}
        className="mb-6 flex flex-wrap items-end gap-3"
      >
        <FieldShell id="a-action" label="نوع رویداد">
          <Select
            id="a-action"
            value={draft.action}
            onChange={(e) => set('action', e.target.value)}
          >
            <option value="">همه رویدادها</option>
            {AUDIT_ACTION_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </FieldShell>
        <FieldShell id="a-actor" label="ایمیل کاربر">
          <TextInput
            id="a-actor"
            type="email"
            dir="ltr"
            value={draft.actor}
            onChange={(e) => set('actor', e.target.value)}
          />
        </FieldShell>
        <FieldShell id="a-from" label="از تاریخ" hint="مانند ۱۴۰۵/۰۱/۰۱">
          <JalaliDateInput
            id="a-from"
            hasHint
            value={draft.from}
            onChange={(iso) => set('from', iso)}
          />
        </FieldShell>
        <FieldShell id="a-to" label="تا تاریخ">
          <JalaliDateInput
            id="a-to"
            value={draft.to}
            error={rangeInvalid ? 'تاریخ شروع نباید بعد از تاریخ پایان باشد.' : undefined}
            onChange={(iso) => set('to', iso)}
          />
        </FieldShell>
        <Button type="submit" disabled={rangeInvalid}>
          اعمال فیلترها
        </Button>
      </form>
      <AsyncBoundary state={state} reload={reload}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState title="رویدادی یافت نشد" description="فیلترها را تغییر دهید." />
          ) : (
            <>
              <ol className="flex flex-col gap-2" aria-label="رویدادها">
                {items.map((item) => {
                  const meta = metadataText(item.metadata);
                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-1.5 rounded-card border border-line p-4 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-ink">
                          {AUDIT_ACTION_LABELS_FA[item.action] ?? item.action}
                        </span>
                        <time dateTime={item.createdAt} className="text-[13px] text-ink-5">
                          {formatDateTimeFa(item.createdAt)}
                        </time>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-4">
                        <span>
                          کاربر:{' '}
                          {item.actor ? (
                            <>
                              {item.actor.fullName} (<span dir="ltr">{item.actor.email}</span>)
                            </>
                          ) : (
                            'سیستم یا مهمان'
                          )}
                        </span>
                        {item.entityType ? (
                          <span>
                            موجودیت: <span dir="ltr">{item.entityType}</span>
                            {item.entityId ? (
                              <>
                                {' '}
                                <span dir="ltr" className="break-all">
                                  {item.entityId}
                                </span>
                              </>
                            ) : null}
                          </span>
                        ) : null}
                        {item.ip ? (
                          <span>
                            IP: <span dir="ltr">{item.ip}</span>
                          </span>
                        ) : null}
                      </div>
                      {meta ? (
                        <p dir="ltr" className="text-start font-mono text-xs break-all text-ink-5">
                          {meta}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              {state.status === 'success' ? (
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={state.meta?.total ?? items.length}
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
