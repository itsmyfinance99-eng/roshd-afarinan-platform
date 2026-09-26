'use client';

import { ROLE_LABELS_FA, ROLES } from '@roshd/types';
import { Button, ErrorMessage, FieldShell, Select, TextInput } from '@roshd/ui';
import { type FormEvent, useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import { UserList, type UserItem } from '@/components/dashboard/users';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 20;

export default function ManageUsersPage() {
  const allowed = useCan('users:read');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) query.set('q', q);
  if (role) query.set('role', role);
  const { state, reload } = useApi<UserItem[]>(allowed ? `/users?${query.toString()}` : null);

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  const search = (event: FormEvent) => {
    event.preventDefault();
    setQ(draft.trim());
    setPage(1);
  };

  return (
    <>
      <PageTitle title="مدیریت کاربران" />
      <form
        role="search"
        method="get"
        onSubmit={search}
        className="mb-6 flex flex-wrap items-end gap-3"
      >
        <FieldShell id="u-q" label="جست‌وجو (نام، ایمیل یا موبایل)">
          <TextInput
            id="u-q"
            type="search"
            value={draft}
            maxLength={100}
            onChange={(e) => setDraft(e.target.value)}
          />
        </FieldShell>
        <FieldShell id="u-role" label="نقش">
          <Select
            id="u-role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">همه نقش‌ها</option>
            {ROLES.filter((r) => r !== 'guest').map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS_FA[r]}
              </option>
            ))}
          </Select>
        </FieldShell>
        <Button type="submit">جست‌وجو</Button>
      </form>
      <AsyncBoundary state={state} reload={reload}>
        {(items) => (
          <>
            <UserList items={items} onChanged={() => reload({ silent: true })} />
            {state.status === 'success' ? (
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={state.meta?.total ?? items.length}
                onChange={setPage}
              />
            ) : null}
          </>
        )}
      </AsyncBoundary>
    </>
  );
}
