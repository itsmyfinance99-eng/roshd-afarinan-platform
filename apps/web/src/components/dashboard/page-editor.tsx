'use client';

import {
  Button,
  ErrorMessage,
  FieldShell,
  Notice,
  Select,
  SuccessMessage,
  TextArea,
  TextInput,
  toPersianDigits,
} from '@roshd/ui';
import {
  CONTENT_STATUS_LABELS_FA,
  LIST_STYLE_LABELS_FA,
  LIST_STYLES,
  PAGE_SECTION_LABELS_FA,
  PAGE_SECTION_TYPES,
  upsertPageSchema,
  type ContentStatus,
  type ListStyle,
  type PageSection,
  type PageSectionType,
} from '@roshd/validation';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useCan } from './me-context';

/** Editor view of a page as returned by GET /cms/pages/:slug. */
export interface EditablePage {
  slug: string;
  title: string;
  sections: PageSection[];
  status: ContentStatus;
  metaTitle: string | null;
  metaDescription: string | null;
  noIndex: boolean;
}

type StatDraft = { value: string; label: string; detail: string };
type SectionDraft =
  | { type: 'intro'; title: string; lead: string }
  | { type: 'stats'; items: StatDraft[] }
  | { type: 'list'; title: string; style: ListStyle; itemsText: string; note: string }
  | { type: 'richText'; title: string; body: string };

function toDraft(s: PageSection): SectionDraft {
  switch (s.type) {
    case 'intro':
      return { type: 'intro', title: s.title, lead: s.lead ?? '' };
    case 'stats':
      return {
        type: 'stats',
        items: s.items.map((i) => ({ value: i.value, label: i.label, detail: i.detail ?? '' })),
      };
    case 'list':
      return {
        type: 'list',
        title: s.title,
        style: s.style,
        itemsText: s.items.join('\n'),
        note: s.note ?? '',
      };
    case 'richText':
      return { type: 'richText', title: s.title ?? '', body: s.body };
  }
}

const opt = (v: string) => (v.trim() ? v.trim() : undefined);

function toSection(d: SectionDraft): Record<string, unknown> {
  switch (d.type) {
    case 'intro':
      return { type: 'intro', title: d.title, lead: opt(d.lead) };
    case 'stats':
      return {
        type: 'stats',
        items: d.items.map((i) => ({ value: i.value, label: i.label, detail: opt(i.detail) })),
      };
    case 'list':
      return {
        type: 'list',
        title: d.title,
        style: d.style,
        items: d.itemsText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        note: opt(d.note),
      };
    case 'richText':
      return { type: 'richText', title: opt(d.title), body: d.body };
  }
}

function emptyDraft(type: PageSectionType): SectionDraft {
  switch (type) {
    case 'intro':
      return { type, title: '', lead: '' };
    case 'stats':
      return { type, items: [{ value: '', label: '', detail: '' }] };
    case 'list':
      return { type, title: '', style: 'chips', itemsText: '', note: '' };
    case 'richText':
      return { type, title: '', body: '' };
  }
}

/**
 * Structured editor for institutional pages (ST-03.04): typed sections, reorder, draft/publish.
 * `fromDefaults` marks a page that exists only in the content layer so far.
 */
export function PageEditor({
  slug,
  page,
  publicPath,
  fromDefaults,
  onSaved,
}: {
  slug: string;
  page: EditablePage;
  publicPath: string;
  fromDefaults: boolean;
  onSaved: () => void;
}) {
  const canPublish = useCan('cms:publish');
  const [title, setTitle] = useState(page.title);
  const [metaTitle, setMetaTitle] = useState(page.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(page.metaDescription ?? '');
  const [noIndex, setNoIndex] = useState(page.noIndex);
  const [sections, setSections] = useState<SectionDraft[]>(page.sections.map(toDraft));
  const [newType, setNewType] = useState<PageSectionType>('richText');
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<SectionDraft>) =>
    setSections((list) => list.map((s, j) => (j === i ? ({ ...s, ...patch } as SectionDraft) : s)));
  const move = (i: number, by: -1 | 1) =>
    setSections((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      if (item) next.splice(i + by, 0, item);
      return next;
    });

  const save = async (event: FormEvent | null, publish: boolean) => {
    event?.preventDefault();
    setMessage(null);
    const payload = {
      title,
      sections: sections.map(toSection),
      metaTitle: opt(metaTitle) ?? null,
      metaDescription: opt(metaDescription) ?? null,
      noIndex,
    };
    const parsed = upsertPageSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(
        parsed.error.issues.map((i) =>
          i.path[0] === 'sections' && typeof i.path[1] === 'number'
            ? `بخش ${toPersianDigits(i.path[1] + 1)}: ${i.message}`
            : i.message,
        ),
      );
      setMessage({ ok: false, text: 'لطفاً موارد مشخص‌شده را اصلاح کنید.' });
      return;
    }
    setErrors([]);
    setBusy(true);
    const result = await apiFetch(
      `/cms/pages/${encodeURIComponent(slug)}${publish ? '?publish=true' : ''}`,
      { method: 'PUT', body: payload },
    );
    setBusy(false);
    if (!result.ok) {
      setErrors(result.details.map((d) => `${d.path}: ${d.message}`));
      setMessage({ ok: false, text: result.message });
      return;
    }
    setMessage({ ok: true, text: publish ? 'صفحه منتشر شد.' : 'پیش‌نویس ذخیره شد.' });
    onSaved();
  };

  return (
    <form
      method="post"
      onSubmit={(e) => void save(e, false)}
      noValidate
      className="flex flex-col gap-5"
    >
      {fromDefaults ? (
        <Notice>
          این صفحه هنوز در سامانه محتوا ذخیره نشده است؛ فرم با متن فعلی سایت پر شده و با ذخیره، نسخه
          قابل ویرایش ساخته می‌شود.
        </Notice>
      ) : (
        <p className="text-sm text-ink-4">
          وضعیت: <strong>{CONTENT_STATUS_LABELS_FA[page.status]}</strong> ·{' '}
          <Link href={publicPath} target="_blank">
            مشاهده در سایت
          </Link>
        </p>
      )}

      <FieldShell id="p-title" label="عنوان صفحه" required>
        <TextInput id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </FieldShell>

      <ol className="flex flex-col gap-4" aria-label="بخش‌های صفحه">
        {sections.map((section, i) => {
          const id = (f: string) => `s${i}-${f}`;
          return (
            <li key={i} className="flex flex-col gap-3 rounded-card border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink-2">
                  بخش {toPersianDigits(i + 1)}: {PAGE_SECTION_LABELS_FA[section.type]}
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === 0}
                    aria-label={`انتقال بخش ${toPersianDigits(i + 1)} به بالا`}
                    onClick={() => move(i, -1)}
                  >
                    بالا
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === sections.length - 1}
                    aria-label={`انتقال بخش ${toPersianDigits(i + 1)} به پایین`}
                    onClick={() => move(i, 1)}
                  >
                    پایین
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`حذف بخش ${toPersianDigits(i + 1)}`}
                    onClick={() => setSections((l) => l.filter((_, j) => j !== i))}
                  >
                    حذف
                  </Button>
                </span>
              </div>

              {section.type === 'intro' ? (
                <>
                  <FieldShell id={id('title')} label="عنوان" required>
                    <TextInput
                      id={id('title')}
                      value={section.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                    />
                  </FieldShell>
                  <FieldShell id={id('lead')} label="متن کوتاه">
                    <TextArea
                      id={id('lead')}
                      rows={3}
                      value={section.lead}
                      onChange={(e) => update(i, { lead: e.target.value })}
                    />
                  </FieldShell>
                </>
              ) : null}

              {section.type === 'stats' ? (
                <>
                  {section.items.map((item, k) => (
                    <div
                      key={k}
                      className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2"
                    >
                      {(['value', 'label', 'detail'] as const).map((f) => (
                        <FieldShell
                          key={f}
                          id={id(`${f}-${k}`)}
                          label={f === 'value' ? 'عدد' : f === 'label' ? 'عنوان' : 'توضیح'}
                        >
                          <TextInput
                            id={id(`${f}-${k}`)}
                            value={item[f]}
                            onChange={(e) =>
                              update(i, {
                                items: section.items.map((x, n) =>
                                  n === k ? { ...x, [f]: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </FieldShell>
                      ))}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={section.items.length >= 8}
                      onClick={() =>
                        update(i, {
                          items: [...section.items, { value: '', label: '', detail: '' }],
                        })
                      }
                    >
                      افزودن آمار
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={section.items.length <= 1}
                      onClick={() => update(i, { items: section.items.slice(0, -1) })}
                    >
                      حذف آخرین
                    </Button>
                  </div>
                </>
              ) : null}

              {section.type === 'list' ? (
                <>
                  <FieldShell id={id('title')} label="عنوان" required>
                    <TextInput
                      id={id('title')}
                      value={section.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                    />
                  </FieldShell>
                  <FieldShell id={id('style')} label="نمایش">
                    <Select
                      id={id('style')}
                      value={section.style}
                      onChange={(e) => update(i, { style: e.target.value as ListStyle })}
                    >
                      {LIST_STYLES.map((s) => (
                        <option key={s} value={s}>
                          {LIST_STYLE_LABELS_FA[s]}
                        </option>
                      ))}
                    </Select>
                  </FieldShell>
                  <FieldShell id={id('items')} label="موارد (هر خط یک مورد)" required>
                    <TextArea
                      id={id('items')}
                      rows={5}
                      value={section.itemsText}
                      onChange={(e) => update(i, { itemsText: e.target.value })}
                    />
                  </FieldShell>
                  <FieldShell id={id('note')} label="یادداشت زیر فهرست">
                    <TextInput
                      id={id('note')}
                      value={section.note}
                      onChange={(e) => update(i, { note: e.target.value })}
                    />
                  </FieldShell>
                </>
              ) : null}

              {section.type === 'richText' ? (
                <>
                  <FieldShell id={id('title')} label="عنوان (اختیاری)">
                    <TextInput
                      id={id('title')}
                      value={section.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                    />
                  </FieldShell>
                  <FieldShell id={id('body')} label="متن (Markdown)" required>
                    <TextArea
                      id={id('body')}
                      rows={8}
                      value={section.body}
                      className="font-mono text-sm"
                      onChange={(e) => update(i, { body: e.target.value })}
                    />
                  </FieldShell>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-end gap-3">
        <FieldShell id="p-new" label="نوع بخش جدید">
          <Select
            id="p-new"
            value={newType}
            onChange={(e) => setNewType(e.target.value as PageSectionType)}
          >
            {PAGE_SECTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {PAGE_SECTION_LABELS_FA[t]}
              </option>
            ))}
          </Select>
        </FieldShell>
        <Button
          variant="outline"
          disabled={sections.length >= 30}
          onClick={() => setSections((l) => [...l, emptyDraft(newType)])}
        >
          افزودن بخش
        </Button>
      </div>

      <div
        role="group"
        aria-labelledby="page-seo"
        className="flex min-w-0 flex-col gap-4 rounded-card border border-line p-4"
      >
        <h2 id="page-seo" className="text-sm font-bold text-ink-2">
          سئو
        </h2>
        <FieldShell id="p-meta-title" label="عنوان سئو (حداکثر ۷۰ نویسه)">
          <TextInput
            id="p-meta-title"
            value={metaTitle}
            onChange={(e) => setMetaTitle(e.target.value)}
          />
        </FieldShell>
        <FieldShell id="p-meta-desc" label="توضیح سئو (حداکثر ۱۷۰ نویسه)">
          <TextInput
            id="p-meta-desc"
            value={metaDescription}
            onChange={(e) => setMetaDescription(e.target.value)}
          />
        </FieldShell>
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={noIndex}
            onChange={(e) => setNoIndex(e.target.checked)}
            className="size-[18px] accent-primary"
          />
          در موتورهای جستجو نمایه نشود (noindex)
        </label>
      </div>

      {errors.length > 0 ? (
        <ul className="list-disc ps-6 text-sm text-danger">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}
      {message ? (
        message.ok ? (
          <SuccessMessage>{message.text}</SuccessMessage>
        ) : (
          <ErrorMessage>{message.text}</ErrorMessage>
        )
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'در حال ذخیره…' : 'ذخیره پیش‌نویس'}
        </Button>
        {canPublish ? (
          <Button variant="outline" disabled={busy} onClick={() => void save(null, true)}>
            ذخیره و انتشار
          </Button>
        ) : null}
      </div>
    </form>
  );
}
