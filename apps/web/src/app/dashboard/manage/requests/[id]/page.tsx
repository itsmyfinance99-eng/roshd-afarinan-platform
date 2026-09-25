'use client';

import { Button, ErrorMessage, FieldShell, Select, SuccessMessage, TextArea } from '@roshd/ui';
import {
  SERVICE_REQUEST_STATUS_LABELS_FA,
  SERVICE_REQUEST_TRANSITIONS,
  type ServiceRequestStatus,
} from '@roshd/validation';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import type { ServiceRequestDetail } from '@/components/dashboard/types';
import {
  AsyncBoundary,
  PageTitle,
  RequestDetails,
  StatusTimeline,
} from '@/components/dashboard/ui';
import { apiFetch } from '@/lib/api-client';
import { FileList } from '@/components/files/files';
import { useApi } from '@/lib/use-api';

export default function ManageRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canRead = useCan('requests:read-all');
  const canManage = useCan('requests:manage');
  const { state, reload } = useApi<ServiceRequestDetail>(
    canRead ? `/service-requests/${encodeURIComponent(id)}` : null,
  );

  if (!canRead) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle
        title="بررسی درخواست"
        action={
          <Link href="/dashboard/manage/requests" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(item) => (
          <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
            <div className="flex flex-col gap-6">
              <RequestDetails item={item} />
              {item.attachments?.length ? (
                <section aria-labelledby="attachments-title">
                  <h2
                    id="attachments-title"
                    className="mb-3 text-base font-extrabold text-brand-900"
                  >
                    پیوست‌ها
                  </h2>
                  <FileList files={item.attachments} />
                </section>
              ) : null}
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[15px]">
                <dt className="text-ink-5">متقاضی</dt>
                <dd>{item.fullName}</dd>
                <dt className="text-ink-5">موبایل</dt>
                <dd dir="ltr" className="text-right">
                  <a href={`tel:${item.mobile}`}>{item.mobile}</a>
                </dd>
                {item.email ? (
                  <>
                    <dt className="text-ink-5">ایمیل</dt>
                    <dd dir="ltr" className="text-right">
                      <a href={`mailto:${item.email}`}>{item.email}</a>
                    </dd>
                  </>
                ) : null}
              </dl>
            </div>
            <div className="flex flex-col gap-8">
              {canManage ? (
                <StatusChanger item={item} onChanged={() => reload({ silent: true })} />
              ) : null}
              <section aria-labelledby="timeline-title">
                <h2 id="timeline-title" className="mb-4 text-base font-extrabold text-brand-900">
                  تاریخچه وضعیت
                </h2>
                <StatusTimeline events={item.events} />
              </section>
            </div>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}

function StatusChanger({ item, onChanged }: { item: ServiceRequestDetail; onChanged: () => void }) {
  const options = SERVICE_REQUEST_TRANSITIONS[item.status];
  const [next, setNext] = useState<ServiceRequestStatus | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!next) return;
    setBusy(true);
    setMessage(null);
    const result = await apiFetch(`/service-requests/${item.id}/status`, {
      method: 'PATCH',
      body: { status: next, note: note.trim() || undefined },
    });
    setBusy(false);
    if (result.ok) {
      setMessage({ ok: true, text: 'وضعیت به‌روز شد.' });
      setNext('');
      setNote('');
      onChanged();
    } else {
      setMessage({ ok: false, text: result.message });
    }
  };

  return (
    <form
      method="post"
      onSubmit={(e) => void submit(e)}
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <h2 className="text-base font-extrabold text-brand-900">تغییر وضعیت</h2>
      <FieldShell id="next-status" label="وضعیت جدید" required>
        <Select
          id="next-status"
          value={next}
          onChange={(e) => setNext(e.target.value as ServiceRequestStatus | '')}
        >
          <option value="">انتخاب کنید</option>
          {options.map((s) => (
            <option key={s} value={s}>
              {SERVICE_REQUEST_STATUS_LABELS_FA[s]}
            </option>
          ))}
        </Select>
      </FieldShell>
      <FieldShell
        id="status-note"
        label="یادداشت داخلی (اختیاری)"
        hint="برای متقاضی نمایش داده نمی‌شود."
      >
        <TextArea
          id="status-note"
          rows={3}
          hasHint
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
        />
      </FieldShell>
      {message ? (
        message.ok ? (
          <SuccessMessage>{message.text}</SuccessMessage>
        ) : (
          <ErrorMessage>{message.text}</ErrorMessage>
        )
      ) : null}
      <Button type="submit" disabled={!next || busy}>
        {busy ? 'در حال ثبت…' : 'ثبت وضعیت'}
      </Button>
    </form>
  );
}
