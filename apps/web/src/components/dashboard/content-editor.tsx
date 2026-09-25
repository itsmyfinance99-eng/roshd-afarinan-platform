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
import {
  CONTENT_KIND_LABELS_FA,
  CONTENT_KINDS,
  CONTENT_STATUS_LABELS_FA,
  createContentEntrySchema,
  updateContentEntrySchema,
  type ContentKind,
  type ContentStatus,
} from '@roshd/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useCan } from './me-context';

export interface EditableEntry {
  id: string;
  kind: ContentKind;
  status: ContentStatus;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  coverImageUrl: string | null;
  categoryId: string | null;
  tags: string[];
  references: { title: string; url?: string }[];
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  noIndex: boolean;
}

interface FormState {
  kind: ContentKind;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverImageUrl: string;
  categoryId: string;
  tags: string;
  references: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  noIndex: boolean;
}

const toForm = (e?: EditableEntry): FormState => ({
  kind: e?.kind ?? 'ARTICLE',
  slug: e?.slug ?? '',
  title: e?.title ?? '',
  excerpt: e?.excerpt ?? '',
  body: e?.body ?? '',
  coverImageUrl: e?.coverImageUrl ?? '',
  categoryId: e?.categoryId ?? '',
  tags: e?.tags.join('، ') ?? '',
  references:
    e?.references.map((r) => (r.url ? `${r.title} | ${r.url}` : r.title)).join('\n') ?? '',
  metaTitle: e?.metaTitle ?? '',
  metaDescription: e?.metaDescription ?? '',
  canonicalUrl: e?.canonicalUrl ?? '',
  noIndex: e?.noIndex ?? false,
});

const nullIfEmpty = (v: string) => (v.trim() === '' ? null : v.trim());

/** Converts the flat form into the API payload (tags: comma list, references: "title | url" lines). */
function toPayload(f: FormState) {
  return {
    slug: f.slug.trim(),
    title: f.title,
    excerpt: f.excerpt.trim() || undefined,
    body: f.body,
    coverImageUrl: nullIfEmpty(f.coverImageUrl),
    categoryId: nullIfEmpty(f.categoryId),
    tags: f.tags
      .split(/[,،]/)
      .map((t) => t.trim())
      .filter(Boolean),
    references: f.references
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title = '', url] = line.split('|').map((part) => part.trim());
        return url ? { title, url } : { title };
      }),
    metaTitle: nullIfEmpty(f.metaTitle),
    metaDescription: nullIfEmpty(f.metaDescription),
    canonicalUrl: nullIfEmpty(f.canonicalUrl),
    noIndex: f.noIndex,
  };
}

const PUBLIC_BASE: Record<ContentKind, string> = { ARTICLE: '/articles', KNOWLEDGE: '/knowledge' };

export function ContentEditor({ entry, onSaved }: { entry?: EditableEntry; onSaved?: () => void }) {
  const router = useRouter();
  const canPublish = useCan('cms:publish');
  const [form, setForm] = useState<FormState>(() => toForm(entry));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<{ id: string; name: string }[]>(`/categories?scope=${form.kind}`, {
      signal: controller.signal,
    }).then((r) => {
      if (r.ok) setCategories(r.data);
    });
    return () => controller.abort();
  }, [form.kind]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const payload = toPayload(form);
    const parsed = entry
      ? updateContentEntrySchema.safeParse(payload)
      : createContentEntrySchema.safeParse({ ...payload, kind: form.kind });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      setMessage({ ok: false, text: 'لطفاً موارد مشخص‌شده را اصلاح کنید.' });
      return;
    }
    setErrors({});
    setBusy(true);
    const result = entry
      ? await apiFetch<EditableEntry>(`/cms/entries/${entry.id}`, {
          method: 'PATCH',
          body: payload,
        })
      : await apiFetch<EditableEntry>('/cms/entries', {
          method: 'POST',
          body: { ...payload, kind: form.kind },
        });
    setBusy(false);
    if (!result.ok) {
      setErrors(
        Object.fromEntries(result.details.map((d) => [d.path.split('.')[0] ?? d.path, d.message])),
      );
      setMessage({ ok: false, text: result.message });
      return;
    }
    setMessage({ ok: true, text: 'ذخیره شد.' });
    if (entry) onSaved?.();
    else router.replace(`/dashboard/content/${result.data.id}`);
  };

  const transition = async (action: 'publish' | 'archive') => {
    if (!entry) return;
    setBusy(true);
    setMessage(null);
    const result = await apiFetch(`/cms/entries/${entry.id}/${action}`, {
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

  const text = (key: keyof FormState, label: string, props: Record<string, unknown> = {}) => (
    <FieldShell
      id={`c-${key}`}
      label={label}
      error={errors[key]}
      required={Boolean(props.required)}
    >
      <TextInput
        id={`c-${key}`}
        value={form[key] as string}
        error={errors[key]}
        onChange={(e) => set(key, e.target.value as never)}
        {...props}
      />
    </FieldShell>
  );

  return (
    <form method="post" onSubmit={(e) => void save(e)} noValidate className="flex flex-col gap-5">
      {entry ? (
        <p className="text-sm text-ink-4">
          نوع: {CONTENT_KIND_LABELS_FA[entry.kind]} · وضعیت:{' '}
          <strong>{CONTENT_STATUS_LABELS_FA[entry.status]}</strong>
          {entry.status === 'PUBLISHED' ? (
            <>
              {' '}
              ·{' '}
              <Link href={`${PUBLIC_BASE[entry.kind]}/${entry.slug}`} target="_blank">
                مشاهده در سایت
              </Link>
            </>
          ) : null}
        </p>
      ) : (
        <FieldShell id="c-kind" label="نوع محتوا" required>
          <Select
            id="c-kind"
            value={form.kind}
            onChange={(e) => set('kind', e.target.value as ContentKind)}
          >
            {CONTENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {CONTENT_KIND_LABELS_FA[k]}
              </option>
            ))}
          </Select>
        </FieldShell>
      )}

      {text('title', 'عنوان', { required: true })}
      <FieldShell
        id="c-slug"
        label="نامک (آدرس صفحه)"
        required
        error={errors.slug}
        hint="حروف کوچک انگلیسی، عدد و خط تیره؛ مثلاً feasibility-basics"
      >
        <TextInput
          id="c-slug"
          dir="ltr"
          className="text-right"
          hasHint
          value={form.slug}
          error={errors.slug}
          onChange={(e) => set('slug', e.target.value)}
        />
      </FieldShell>
      <FieldShell id="c-category" label="دسته">
        <Select
          id="c-category"
          value={form.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
        >
          <option value="">بدون دسته</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FieldShell>
      <FieldShell id="c-excerpt" label="خلاصه" error={errors.excerpt}>
        <TextArea
          id="c-excerpt"
          rows={2}
          value={form.excerpt}
          onChange={(e) => set('excerpt', e.target.value)}
        />
      </FieldShell>
      <FieldShell
        id="c-body"
        label="متن (Markdown)"
        required
        error={errors.body}
        hint="از ## برای تیتر، - برای فهرست و [متن](نشانی) برای پیوند استفاده کنید. HTML نمایش داده نمی‌شود."
      >
        <TextArea
          id="c-body"
          rows={16}
          hasHint
          value={form.body}
          error={errors.body}
          onChange={(e) => set('body', e.target.value)}
          className="font-mono text-sm"
        />
      </FieldShell>
      {text('tags', 'برچسب‌ها (با کاما جدا کنید)')}
      <FieldShell id="c-references" label="منابع (هر خط: عنوان | نشانی)" error={errors.references}>
        <TextArea
          id="c-references"
          rows={3}
          value={form.references}
          onChange={(e) => set('references', e.target.value)}
        />
      </FieldShell>

      <fieldset className="flex flex-col gap-4 rounded-card border border-line p-4">
        <legend className="px-2 text-sm font-bold text-ink-2">سئو</legend>
        {text('metaTitle', 'عنوان سئو (حداکثر ۷۰ نویسه)')}
        {text('metaDescription', 'توضیح سئو (حداکثر ۱۷۰ نویسه)')}
        {text('canonicalUrl', 'نشانی canonical (اختیاری)', { dir: 'ltr', className: 'text-right' })}
        {text('coverImageUrl', 'نشانی تصویر شاخص (اختیاری)', {
          dir: 'ltr',
          className: 'text-right',
        })}
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.noIndex}
            onChange={(e) => set('noIndex', e.target.checked)}
            className="size-[18px] accent-primary"
          />
          در موتورهای جستجو نمایه نشود (noindex)
        </label>
      </fieldset>

      {message ? (
        message.ok ? (
          <SuccessMessage>{message.text}</SuccessMessage>
        ) : (
          <ErrorMessage>{message.text}</ErrorMessage>
        )
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'در حال ذخیره…' : entry ? 'ذخیره تغییرات' : 'ایجاد پیش‌نویس'}
        </Button>
        {entry && canPublish && entry.status !== 'PUBLISHED' ? (
          <Button variant="outline" disabled={busy} onClick={() => void transition('publish')}>
            انتشار
          </Button>
        ) : null}
        {entry && canPublish && entry.status === 'PUBLISHED' ? (
          <Button variant="ghost" disabled={busy} onClick={() => void transition('archive')}>
            بایگانی
          </Button>
        ) : null}
      </div>
    </form>
  );
}
