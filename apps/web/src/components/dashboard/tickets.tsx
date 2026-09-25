'use client';

import {
  Button,
  cn,
  EmptyState,
  ErrorMessage,
  FieldShell,
  formatDateFa,
  Select,
  SuccessMessage,
  TextArea,
  toPersianDigits,
} from '@roshd/ui';
import {
  TICKET_CATEGORY_LABELS_FA,
  TICKET_PRIORITY_LABELS_FA,
  TICKET_STATUS_LABELS_FA,
  TICKET_STATUSES,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '@roshd/validation';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { FileList, FileUploader, type FileItem } from '@/components/files/files';
import { apiFetch } from '@/lib/api-client';

export interface TicketSummary {
  id: string;
  code: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  lastMessageAt: string;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  requester?: { id: string; fullName: string; email: string };
  messages: {
    id: string;
    fromStaff: boolean;
    internal: boolean;
    body: string;
    createdAt: string;
    authorName: string | null;
  }[];
  attachments?: FileItem[];
}

const STATUS_TONE: Record<TicketStatus, string> = {
  OPEN: 'bg-notice-bg text-notice-fg',
  PENDING: 'bg-primary-soft text-primary',
  ANSWERED: 'bg-success-bg text-success-fg',
  CLOSED: 'bg-surface-2 text-ink-4',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={cn(
        'inline-block rounded-chip px-2 py-[3px] text-xs font-bold',
        STATUS_TONE[status],
      )}
    >
      {TICKET_STATUS_LABELS_FA[status]}
    </span>
  );
}

export function TicketList({ items, hrefBase }: { items: TicketSummary[]; hrefBase: string }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="تیکتی وجود ندارد"
        description="برای پرسش یا پیگیری، یک تیکت پشتیبانی ثبت کنید."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((t) => (
        <li key={t.id}>
          <Link
            href={`${hrefBase}/${t.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4 text-ink no-underline hover:border-line-hover hover:text-ink"
          >
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-bold">{t.subject}</span>
              <span className="text-[13px] text-ink-5">
                <span dir="ltr">{toPersianDigits(t.code)}</span> ·{' '}
                {TICKET_CATEGORY_LABELS_FA[t.category]} · آخرین پیام {formatDateFa(t.lastMessageAt)}
              </span>
            </span>
            <TicketStatusBadge status={t.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Conversation + reply form. Staff mode adds internal notes, requester info and status control. */
export function TicketConversation({
  ticket,
  mode,
  onChanged,
}: {
  ticket: TicketDetail;
  mode: 'owner' | 'staff';
  onChanged: () => void;
}) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const closed = ticket.status === 'CLOSED';

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (body.trim().length < 2) {
      setMessage({ ok: false, text: 'متن پیام را بنویسید.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await apiFetch(`/tickets/${ticket.id}/messages`, {
      method: 'POST',
      body: {
        body,
        internal: mode === 'staff' && internal,
        ...(files.length ? { attachmentIds: files.map((f) => f.id) } : {}),
      },
    });
    setBusy(false);
    if (result.ok) {
      setBody('');
      setFiles([]);
      setInternal(false);
      setMessage({ ok: true, text: 'پیام ثبت شد.' });
      onChanged();
    } else {
      setMessage({ ok: false, text: result.message });
    }
  };

  const setStatus = async (status: TicketStatus) => {
    setBusy(true);
    setMessage(null);
    const result = await apiFetch(`/tickets/${ticket.id}/status`, {
      method: 'PATCH',
      body: { status },
    });
    setBusy(false);
    if (result.ok) onChanged();
    else setMessage({ ok: false, text: result.message });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-4">
        <TicketStatusBadge status={ticket.status} />
        <span dir="ltr">{toPersianDigits(ticket.code)}</span>
        <span>{TICKET_CATEGORY_LABELS_FA[ticket.category]}</span>
        <span>اولویت: {TICKET_PRIORITY_LABELS_FA[ticket.priority]}</span>
        {ticket.requester ? (
          <span>
            · {ticket.requester.fullName} (<span dir="ltr">{ticket.requester.email}</span>)
          </span>
        ) : null}
      </div>

      <ol className="flex flex-col gap-3" aria-label="گفت‌وگو">
        {ticket.messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              'max-w-[85%] rounded-card p-4 text-[15px] leading-loose',
              m.internal
                ? 'self-center border border-dashed border-notice-border bg-notice-bg'
                : m.fromStaff
                  ? 'self-end bg-primary-soft'
                  : 'self-start border border-line bg-white',
            )}
          >
            <p className="mb-1 text-xs font-bold text-ink-4">
              {m.internal ? 'یادداشت داخلی · ' : ''}
              {m.fromStaff
                ? (m.authorName ?? 'پشتیبانی')
                : mode === 'staff'
                  ? 'کاربر'
                  : 'شما'} · {formatDateFa(m.createdAt)}
            </p>
            <p className="whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ol>

      {ticket.attachments?.length ? (
        <section aria-labelledby="ticket-files">
          <h2 id="ticket-files" className="mb-2 text-sm font-bold text-ink-2">
            پیوست‌ها
          </h2>
          <FileList files={ticket.attachments} />
        </section>
      ) : null}

      {closed ? (
        <p className="rounded-card bg-surface p-4 text-sm text-ink-4">
          این تیکت بسته شده است. برای پرسش جدید، تیکت دیگری ثبت کنید.
        </p>
      ) : (
        <form
          method="post"
          onSubmit={(e) => void send(e)}
          className="flex flex-col gap-3 rounded-card border border-line p-4"
        >
          <FieldShell id="ticket-reply" label={mode === 'staff' ? 'پاسخ' : 'پیام شما'} required>
            <TextArea
              id="ticket-reply"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
            />
          </FieldShell>
          {mode === 'staff' ? (
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={internal}
                onChange={(e) => setInternal(e.target.checked)}
                className="size-[18px] accent-primary"
              />
              یادداشت داخلی (برای کاربر نمایش داده نمی‌شود)
            </label>
          ) : null}
          <FileList
            files={files}
            onRemove={(f) => setFiles((l) => l.filter((x) => x.id !== f.id))}
          />
          {files.length < 5 ? (
            <FileUploader
              purpose="TICKET_ATTACHMENT"
              onUploaded={(f) => setFiles((l) => [...l, f])}
            />
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'در حال ارسال…' : 'ارسال'}
            </Button>
            {mode === 'owner' ? (
              <Button variant="ghost" disabled={busy} onClick={() => void setStatus('CLOSED')}>
                بستن تیکت
              </Button>
            ) : null}
          </div>
        </form>
      )}

      {mode === 'staff' ? (
        <FieldShell id="ticket-status" label="تغییر وضعیت">
          <Select
            id="ticket-status"
            value={ticket.status}
            disabled={busy}
            onChange={(e) => void setStatus(e.target.value as TicketStatus)}
          >
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABELS_FA[s]}
              </option>
            ))}
          </Select>
        </FieldShell>
      ) : null}

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
