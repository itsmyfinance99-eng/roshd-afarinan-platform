'use client';

import {
  decideRoleAssignment,
  decideStatusChange,
  normaliseRoles,
  PRIVILEGED_ROLES,
  ROLE_LABELS_FA,
  ROLES,
  type Role,
} from '@roshd/types';
import {
  Button,
  cn,
  EmptyState,
  ErrorMessage,
  formatDateFa,
  SuccessMessage,
  toPersianDigits,
} from '@roshd/ui';
import { useId, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useCan, useMe } from './me-context';

/** Mirrors the API UserView. */
export interface UserItem {
  id: string;
  email: string;
  mobile: string | null;
  fullName: string;
  status: 'ACTIVE' | 'SUSPENDED';
  roles: Role[];
  createdAt: string;
}

/** Roles an operator can tick (`guest` is implicit for anonymous visitors, never assigned). */
const ASSIGNABLE: readonly Role[] = ROLES.filter((r) => r !== 'guest');

export function RoleChips({ roles }: { roles: readonly Role[] }) {
  return (
    <ul aria-label="نقش‌ها" className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <li
          key={role}
          className={cn(
            'rounded-chip px-2 py-[3px] text-xs font-bold',
            PRIVILEGED_ROLES.includes(role)
              ? 'bg-notice-bg text-notice-fg'
              : 'bg-surface-2 text-ink-3',
          )}
        >
          {ROLE_LABELS_FA[role]}
        </li>
      ))}
    </ul>
  );
}

/**
 * Role editor. It applies the shared role-assignment policy to disable what the API would
 * refuse (own account, admin roles without super_admin); the API still enforces it.
 */
function RoleEditor({ user, onSaved }: { user: UserItem; onSaved: () => void }) {
  const me = useMe();
  const uid = useId();
  const [selected, setSelected] = useState<Role[]>(normaliseRoles(user.roles));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const isSuperAdmin = me.roles.includes('super_admin');

  const base = {
    actorId: me.id,
    actorRoles: me.roles,
    targetId: user.id,
    currentRoles: user.roles,
  };
  const current = decideRoleAssignment({ ...base, nextRoles: normaliseRoles(user.roles) });
  if (!current.allowed) {
    return (
      <p className="rounded-card bg-surface p-3 text-sm text-ink-4">
        {current.reason === 'self'
          ? 'نقش‌های حساب خودتان را نمی‌توانید تغییر دهید.'
          : 'تغییر نقش‌های این حساب فقط با دسترسی مدیر ارشد ممکن است.'}
      </p>
    );
  }

  const next = normaliseRoles(selected);
  const changed = next.join() !== normaliseRoles(user.roles).join();
  const toggle = (role: Role, on: boolean) =>
    setSelected((list) => (on ? [...list, role] : list.filter((r) => r !== role)));

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const result = await apiFetch<UserItem>(`/users/${user.id}/roles`, {
      method: 'PUT',
      body: { roles: next },
    });
    setBusy(false);
    if (result.ok) {
      setMessage({ ok: true, text: 'نقش‌ها ذخیره شد.' });
      onSaved();
    } else {
      setMessage({ ok: false, text: result.message });
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-4">
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-ink-2">نقش‌ها</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
          {ASSIGNABLE.map((role) => {
            const locked = role === 'user' || (PRIVILEGED_ROLES.includes(role) && !isSuperAdmin);
            return (
              <label
                key={role}
                htmlFor={`${uid}-${role}`}
                className={cn(
                  'flex min-h-9 items-center gap-2 text-sm',
                  locked ? 'text-ink-5' : 'cursor-pointer text-ink-2',
                )}
              >
                <input
                  id={`${uid}-${role}`}
                  type="checkbox"
                  checked={next.includes(role)}
                  disabled={locked || busy}
                  onChange={(e) => toggle(role, e.target.checked)}
                  className="size-[18px] accent-primary"
                />
                {ROLE_LABELS_FA[role]}
              </label>
            );
          })}
        </div>
      </fieldset>
      {!isSuperAdmin ? (
        <p className="text-[13px] text-ink-5">
          نقش‌های «مدیر» و «مدیر ارشد» فقط توسط مدیر ارشد قابل تغییر است. نقش «کاربر» همیشه حفظ
          می‌شود.
        </p>
      ) : null}
      <div>
        <Button size="sm" disabled={!changed || busy} onClick={() => void save()}>
          {busy ? 'در حال ذخیره…' : 'ذخیره نقش‌ها'}
        </Button>
      </div>
      {message ? (
        message.ok ? (
          <SuccessMessage>{message.text}</SuccessMessage>
        ) : (
          <ErrorMessage>{message.text}</ErrorMessage>
        )
      ) : null}
    </div>
  );
}

/**
 * Suspend or reactivate an account. The shared policy disables what the API would refuse
 * (own account; admin accounts without super_admin). Suspension ends every session at once.
 */
function StatusControl({ user, onSaved }: { user: UserItem; onSaved: () => void }) {
  const me = useMe();
  const uid = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const decision = decideStatusChange({
    actorId: me.id,
    actorRoles: me.roles,
    targetId: user.id,
    targetRoles: user.roles,
  });
  if (!decision.allowed) return null;

  const suspended = user.status === 'SUSPENDED';
  const submit = async () => {
    setBusy(true);
    setMessage(null);
    const result = await apiFetch<UserItem>(`/users/${user.id}/status`, {
      method: 'PATCH',
      body: suspended
        ? { status: 'ACTIVE' }
        : { status: 'SUSPENDED', ...(reason.trim() ? { reason: reason.trim() } : {}) },
    });
    setBusy(false);
    if (result.ok) {
      setReason('');
      setMessage({ ok: true, text: suspended ? 'حساب فعال شد.' : 'حساب تعلیق شد.' });
      onSaved();
    } else {
      setMessage({ ok: false, text: result.message });
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line p-4">
      <p className="text-sm font-bold text-ink-2">وضعیت حساب</p>
      {suspended ? (
        <p className="text-sm text-ink-4">این حساب تعلیق شده است و امکان ورود ندارد.</p>
      ) : (
        <>
          <p className="text-[13px] text-ink-5">
            با تعلیق، کاربر فوراً از همه دستگاه‌ها خارج می‌شود و تا فعال‌سازی دوباره نمی‌تواند وارد
            شود.
          </p>
          <label htmlFor={`${uid}-reason`} className="flex flex-col gap-1 text-sm">
            دلیل تعلیق (در گزارش رویدادها ثبت می‌شود)
            <input
              id={`${uid}-reason`}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              className="h-10 rounded-control border border-line-strong px-3 text-sm"
            />
          </label>
        </>
      )}
      <div>
        <Button
          size="sm"
          variant={suspended ? 'primary' : 'outline'}
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? 'در حال ذخیره…' : suspended ? 'فعال‌سازی حساب' : 'تعلیق حساب'}
        </Button>
      </div>
      {message ? (
        message.ok ? (
          <SuccessMessage>{message.text}</SuccessMessage>
        ) : (
          <ErrorMessage>{message.text}</ErrorMessage>
        )
      ) : null}
    </div>
  );
}

export function UserList({ items, onChanged }: { items: UserItem[]; onChanged: () => void }) {
  const canManage = useCan('users:manage-roles');
  const [open, setOpen] = useState<string | null>(null);

  if (items.length === 0) {
    return <EmptyState title="کاربری یافت نشد" description="عبارت یا نقش دیگری را امتحان کنید." />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((user) => (
        <li
          key={user.id}
          className="flex flex-col gap-3 rounded-card border border-line bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[15px] font-bold text-ink">
                {user.fullName}
                {user.status === 'SUSPENDED' ? (
                  <span className="ms-2 rounded-chip border border-danger px-2 py-[2px] text-xs text-danger">
                    تعلیق‌شده
                  </span>
                ) : null}
              </span>
              <span dir="ltr" className="truncate text-end text-[13px] text-ink-4">
                {user.email}
                {user.mobile ? ` · ${toPersianDigits(user.mobile)}` : ''}
              </span>
              <span className="text-[13px] text-ink-5">عضویت: {formatDateFa(user.createdAt)}</span>
            </div>
            <RoleChips roles={user.roles} />
          </div>
          {canManage ? (
            <div>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={open === user.id}
                onClick={() => setOpen(open === user.id ? null : user.id)}
              >
                {open === user.id ? 'بستن' : 'مدیریت حساب'}
              </Button>
            </div>
          ) : null}
          {canManage && open === user.id ? (
            <>
              <RoleEditor user={user} onSaved={onChanged} />
              <StatusControl user={user} onSaved={onChanged} />
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
