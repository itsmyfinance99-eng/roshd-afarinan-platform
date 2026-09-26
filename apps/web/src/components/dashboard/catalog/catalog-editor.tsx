'use client';

import {
  Button,
  ErrorMessage,
  FieldShell,
  Select,
  SuccessMessage,
  TextArea,
  TextInput,
} from '@roshd/ui';
import { CONTENT_STATUS_LABELS_FA, toLatinDigits, type ContentStatus } from '@roshd/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { CatalogConfig, FieldDef, OptionSource } from './config';

/** A catalog record as returned by the management API (fields vary per catalog). */
export type CatalogRecord = Record<string, unknown> & {
  id: string;
  slug: string;
  title: string;
  status: ContentStatus;
  isDemo: boolean;
  updatedAt: string;
};

type FormState = Record<string, string | boolean>;
type Option = { value: string; label: string };

/** YYYY-MM-DD of an instant in Iran time (for date inputs). */
function tehranDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(iso));
}

function toForm(fields: FieldDef[], record?: CatalogRecord): FormState {
  return Object.fromEntries(
    fields.map((f) => {
      const value = record?.[f.name];
      if (f.kind === 'checkbox') return [f.name, value === true];
      if (f.kind === 'date') return [f.name, typeof value === 'string' ? tehranDay(value) : ''];
      if (value === null || value === undefined) return [f.name, ''];
      return [f.name, String(value as string | number)];
    }),
  );
}

/** Flat form → API payload: empty optional values become null, numbers and dates are typed. */
function toPayload(fields: FieldDef[], form: FormState): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => {
      const raw = form[f.name];
      if (f.kind === 'checkbox') return [f.name, raw === true];
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (value === '') return [f.name, f.required ? '' : null];
      if (f.kind === 'int') return [f.name, Number(toLatinDigits(value))];
      if (f.kind === 'date') return [f.name, `${value}T00:00:00+03:30`];
      if (f.kind === 'markdown' || f.kind === 'textarea') return [f.name, raw];
      return [f.name, value];
    }),
  );
}

function useOptions(source: OptionSource): Option[] {
  const [loaded, setLoaded] = useState<Option[]>([]);
  const path =
    source === 'instructors'
      ? '/catalog/instructors'
      : Array.isArray(source)
        ? null
        : `/categories?scope=${source.categories}`;
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void apiFetch<{ id: string; name: string; title?: string | null }[]>(path, {
      signal: controller.signal,
    }).then((r) => {
      if (r.ok) setLoaded(r.data.map((o) => ({ value: o.id, label: o.name })));
    });
    return () => controller.abort();
  }, [path]);
  return Array.isArray(source) ? source : loaded;
}

function SelectField({
  field,
  value,
  error,
  onChange,
}: {
  field: Extract<FieldDef, { kind: 'select' }>;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const options = useOptions(field.options);
  const id = `cat-${field.name}`;
  return (
    <FieldShell id={id} label={field.label} required={field.required} error={error}>
      <Select id={id} value={value} error={error} onChange={(e) => onChange(e.target.value)}>
        <option value="">{field.emptyLabel ?? 'انتخاب کنید'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </FieldShell>
  );
}

export function CatalogEditor({
  config,
  record,
  onSaved,
}: {
  config: CatalogConfig;
  record?: CatalogRecord;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toForm(config.fields, record));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (name: string, value: string | boolean) => setForm((f) => ({ ...f, [name]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const payload = toPayload(config.fields, form);
    const parsed = (record ? config.updateSchema : config.createSchema).safeParse(payload);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      setMessage({ ok: false, text: 'لطفاً موارد مشخص‌شده را اصلاح کنید.' });
      return;
    }
    setErrors({});
    setBusy(true);
    const result = record
      ? await apiFetch<CatalogRecord>(`${config.apiBase}/${record.id}`, {
          method: 'PATCH',
          body: payload,
        })
      : await apiFetch<CatalogRecord>(config.apiBase, { method: 'POST', body: payload });
    setBusy(false);
    if (!result.ok) {
      setErrors(
        Object.fromEntries(result.details.map((d) => [d.path.split('.')[0] ?? d.path, d.message])),
      );
      setMessage({ ok: false, text: result.message });
      return;
    }
    setMessage({ ok: true, text: 'ذخیره شد.' });
    if (record) onSaved?.();
    else router.replace(`/dashboard/catalog/${config.type}/${result.data.id}`);
  };

  const transition = async (action: 'publish' | 'archive') => {
    if (!record) return;
    setBusy(true);
    setMessage(null);
    const result = await apiFetch(`${config.apiBase}/${record.id}/${action}`, {
      method: 'POST',
      body: {},
    });
    setBusy(false);
    if (result.ok) {
      setMessage({ ok: true, text: action === 'publish' ? 'منتشر شد.' : 'بایگانی شد.' });
      onSaved?.();
    } else {
      setMessage({ ok: false, text: result.message });
    }
  };

  const render = (field: FieldDef) => {
    const id = `cat-${field.name}`;
    const error = errors[field.name];
    const value = form[field.name];
    switch (field.kind) {
      case 'checkbox':
        return (
          <label key={field.name} htmlFor={id} className="flex items-center gap-2.5 text-sm">
            <input
              id={id}
              type="checkbox"
              checked={value === true}
              onChange={(e) => set(field.name, e.target.checked)}
              className="size-[18px] accent-primary"
            />
            {field.label}
          </label>
        );
      case 'select':
        return (
          <SelectField
            key={field.name}
            field={field}
            value={String(value)}
            error={error}
            onChange={(v) => set(field.name, v)}
          />
        );
      case 'textarea':
      case 'markdown':
        return (
          <FieldShell
            key={field.name}
            id={id}
            label={field.label}
            required={field.required}
            error={error}
            hint={field.hint}
          >
            <TextArea
              id={id}
              rows={field.kind === 'markdown' ? 14 : (field.rows ?? 3)}
              hasHint={Boolean(field.hint)}
              value={String(value)}
              error={error}
              onChange={(e) => set(field.name, e.target.value)}
              className={field.kind === 'markdown' ? 'font-mono text-sm' : undefined}
            />
          </FieldShell>
        );
      default: {
        const ltr = field.kind !== 'text' || field.ltr;
        return (
          <FieldShell
            key={field.name}
            id={id}
            label={field.label}
            required={field.required}
            error={error}
            hint={field.hint}
          >
            <TextInput
              id={id}
              type={field.kind === 'date' ? 'date' : 'text'}
              inputMode={field.kind === 'int' || field.kind === 'money' ? 'numeric' : undefined}
              dir={ltr ? 'ltr' : undefined}
              className={ltr ? 'text-right' : undefined}
              hasHint={Boolean(field.hint)}
              value={String(value)}
              error={error}
              onChange={(e) => set(field.name, e.target.value)}
            />
          </FieldShell>
        );
      }
    }
  };

  return (
    <form method="post" onSubmit={(e) => void save(e)} noValidate className="flex flex-col gap-5">
      {record ? (
        <p className="text-sm text-ink-4">
          وضعیت: <strong>{CONTENT_STATUS_LABELS_FA[record.status]}</strong>
          {record.isDemo ? ' · نمونه نمایشی' : ''}
          {record.status === 'PUBLISHED' ? (
            <>
              {' '}
              ·{' '}
              <Link href={`${config.publicBase}/${record.slug}`} target="_blank">
                مشاهده در سایت
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {config.fields.filter((f) => !f.seo).map(render)}

      <div
        role="group"
        aria-labelledby="seo-group"
        className="flex min-w-0 flex-col gap-4 rounded-card border border-line p-4"
      >
        <h2 id="seo-group" className="text-sm font-bold text-ink-2">
          سئو و تصویر
        </h2>
        {config.fields.filter((f) => f.seo).map(render)}
      </div>

      {message ? (
        message.ok ? (
          <SuccessMessage>{message.text}</SuccessMessage>
        ) : (
          <ErrorMessage>{message.text}</ErrorMessage>
        )
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'در حال ذخیره…' : record ? 'ذخیره تغییرات' : 'ایجاد پیش‌نویس'}
        </Button>
        {record && record.status !== 'PUBLISHED' ? (
          <Button variant="outline" disabled={busy} onClick={() => void transition('publish')}>
            انتشار
          </Button>
        ) : null}
        {record && record.status === 'PUBLISHED' ? (
          <Button variant="ghost" disabled={busy} onClick={() => void transition('archive')}>
            بایگانی
          </Button>
        ) : null}
      </div>
    </form>
  );
}
