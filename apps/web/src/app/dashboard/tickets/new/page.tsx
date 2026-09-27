'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, ErrorMessage, FieldShell, Select, TextArea, TextInput } from '@roshd/ui';
import {
  createTicketSchema,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS_FA,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS_FA,
} from '@roshd/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PageTitle } from '@/components/dashboard/ui';
import { FileList, FileUploader, type FileItem } from '@/components/files/files';
import { apiFetch } from '@/lib/api-client';

interface Values {
  subject: string;
  category: string;
  priority: string;
  message: string;
}

export default function NewTicketPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(createTicketSchema as never) as never,
    defaultValues: { subject: '', category: 'GENERAL', priority: 'NORMAL', message: '' },
    mode: 'onTouched',
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const result = await apiFetch<{ id: string }>('/tickets', {
      method: 'POST',
      body: { ...values, ...(files.length ? { attachmentIds: files.map((f) => f.id) } : {}) },
    });
    if (result.ok) {
      router.replace(`/dashboard/tickets/${result.data.id}`);
      return;
    }
    for (const d of result.details) form.setError(d.path as keyof Values, { message: d.message });
    setError(result.message);
  });

  return (
    <>
      <PageTitle
        title="تیکت جدید"
        action={
          <Link href="/dashboard/tickets" className="text-sm no-underline">
            بازگشت ‹
          </Link>
        }
      />
      <form method="post" onSubmit={onSubmit} noValidate className="flex max-w-2xl flex-col gap-4">
        <FieldShell id="t-subject" label="موضوع" required error={errors.subject?.message}>
          <TextInput id="t-subject" error={errors.subject?.message} {...form.register('subject')} />
        </FieldShell>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-4">
          <FieldShell id="t-category" label="دسته">
            <Select id="t-category" {...form.register('category')}>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {TICKET_CATEGORY_LABELS_FA[c]}
                </option>
              ))}
            </Select>
          </FieldShell>
          <FieldShell id="t-priority" label="اولویت">
            <Select id="t-priority" {...form.register('priority')}>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY_LABELS_FA[p]}
                </option>
              ))}
            </Select>
          </FieldShell>
        </div>
        <FieldShell id="t-message" label="شرح" required error={errors.message?.message}>
          <TextArea
            id="t-message"
            rows={6}
            error={errors.message?.message}
            {...form.register('message')}
          />
        </FieldShell>
        <FileList files={files} onRemove={(f) => setFiles((l) => l.filter((x) => x.id !== f.id))} />
        {files.length < 5 ? (
          <FileUploader
            purpose="TICKET_ATTACHMENT"
            onUploaded={(f) => setFiles((l) => [...l, f])}
          />
        ) : null}
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'در حال ثبت…' : 'ثبت تیکت'}
          </Button>
        </div>
      </form>
    </>
  );
}
