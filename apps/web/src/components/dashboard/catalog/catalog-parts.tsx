'use client';

import { Button, cn, ErrorMessage, SuccessMessage, TextInput } from '@roshd/ui';
import type { CategoryScope } from '@roshd/validation';
import Link from 'next/link';
import { type FormEvent, useId, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { CATALOG_TYPES, CATALOGS, type CatalogType } from './config';

export function CatalogTabs({ active }: { active: CatalogType }) {
  return (
    <nav aria-label="کاتالوگ‌ها" className="mb-6 flex flex-wrap gap-2">
      {CATALOG_TYPES.map((type) => (
        <Link
          key={type}
          href={`/dashboard/catalog/${type}`}
          aria-current={type === active ? 'page' : undefined}
          className={cn(
            'inline-flex h-9 items-center rounded-chip border px-3 text-[13px] font-semibold no-underline',
            type === active
              ? 'border-brand-900 bg-brand-900 text-white hover:text-white'
              : 'border-line-strong bg-white text-ink-2 hover:border-primary',
          )}
        >
          {CATALOGS[type].title}
        </Link>
      ))}
    </nav>
  );
}

/** Small inline form that POSTs a couple of text fields (instructors, categories). */
function QuickAdd({
  title,
  fields,
  submit,
}: {
  title: string;
  fields: { name: string; label: string; ltr?: boolean }[];
  submit: (values: Record<string, string>) => Promise<{ ok: boolean; message?: string }>;
}) {
  const uid = useId();
  const empty = Object.fromEntries(fields.map((f) => [f.name, '']));
  const [values, setValues] = useState<Record<string, string>>(empty);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await submit(values);
    setBusy(false);
    if (result.ok) {
      setValues(empty);
      setMessage({ ok: true, text: 'افزوده شد.' });
    } else {
      setMessage({ ok: false, text: result.message ?? 'ثبت انجام نشد.' });
    }
  };

  return (
    <details className="rounded-card border border-line p-4">
      <summary className="cursor-pointer text-sm font-bold text-ink-2">{title}</summary>
      <form
        method="post"
        onSubmit={(e) => void onSubmit(e)}
        className="mt-3 flex flex-wrap items-end gap-3"
      >
        {fields.map((f) => (
          <label key={f.name} htmlFor={`${uid}-${f.name}`} className="flex flex-col gap-1 text-sm">
            {f.label}
            <TextInput
              id={`${uid}-${f.name}`}
              dir={f.ltr ? 'ltr' : undefined}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          </label>
        ))}
        <Button type="submit" size="sm" disabled={busy}>
          افزودن
        </Button>
      </form>
      {message ? (
        <div className="mt-3">
          {message.ok ? (
            <SuccessMessage>{message.text}</SuccessMessage>
          ) : (
            <ErrorMessage>{message.text}</ErrorMessage>
          )}
        </div>
      ) : null}
    </details>
  );
}

export function InstructorQuickAdd() {
  return (
    <QuickAdd
      title="افزودن مدرس"
      fields={[
        { name: 'name', label: 'نام مدرس' },
        { name: 'title', label: 'عنوان تخصصی (اختیاری)' },
      ]}
      submit={async (v) => {
        const r = await apiFetch('/catalog/instructors', {
          method: 'POST',
          body: { name: v.name, title: v.title?.trim() ? v.title : null },
        });
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }}
    />
  );
}

/** Categories are CMS taxonomy: creating one needs `cms:write` (checked by the API). */
export function CategoryQuickAdd({ scope }: { scope: CategoryScope }) {
  return (
    <QuickAdd
      title="افزودن دسته"
      fields={[
        { name: 'name', label: 'نام دسته' },
        { name: 'slug', label: 'نامک انگلیسی', ltr: true },
      ]}
      submit={async (v) => {
        const r = await apiFetch('/cms/categories', {
          method: 'POST',
          body: { scope, name: v.name, slug: v.slug },
        });
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }}
    />
  );
}
