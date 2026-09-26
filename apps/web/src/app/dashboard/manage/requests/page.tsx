'use client';

import {
  Button,
  ChipGroup,
  ErrorMessage,
  FieldShell,
  SuccessMessage,
  TextInput,
  toPersianDigits,
} from '@roshd/ui';
import {
  SERVICE_REQUEST_STATUS_LABELS_FA,
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_TYPE_LABELS_FA,
  SERVICE_REQUEST_TYPES,
} from '@roshd/validation';
import { useState } from 'react';
import { ASSIGNEE_FILTER_OPTIONS } from '@/components/dashboard/assignee';
import { useCan } from '@/components/dashboard/me-context';
import type { ServiceRequestItem } from '@/components/dashboard/types';
import { AsyncBoundary, PageTitle, Pagination, RequestList } from '@/components/dashboard/ui';
import { apiDownload, saveBlob } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 20;
const ALL = 'ALL';

export default function ManageRequestsPage() {
  const allowed = useCan('requests:read-all');
  const [status, setStatus] = useState<string>('NEW');
  const [type, setType] = useState<string>(ALL);
  const [assignee, setAssignee] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const filters = new URLSearchParams();
  if (status !== ALL) filters.set('status', status);
  if (type !== ALL) filters.set('type', type);
  if (from) filters.set('from', from);
  if (to) filters.set('to', to);
  const rangeInvalid = Boolean(from && to && from > to);
  const query = new URLSearchParams(filters);
  if (assignee !== ALL) query.set('assignee', assignee);
  query.set('page', String(page));
  query.set('pageSize', String(PAGE_SIZE));
  const { state, reload } = useApi<ServiceRequestItem[]>(
    allowed && !rangeInvalid ? `/service-requests?${query.toString()}` : null,
  );

  const runExport = async () => {
    setExporting(true);
    setExportMessage(null);
    const qs = filters.toString();
    const result = await apiDownload(
      `/service-requests/export${qs ? `?${qs}` : ''}`,
      'service-requests.csv',
    );
    setExporting(false);
    if (!result.ok) {
      setExportMessage({ ok: false, text: result.message });
      return;
    }
    saveBlob(result.blob, result.fileName);
    setExportMessage({
      ok: true,
      text:
        result.rows === null
          ? 'فایل خروجی آماده شد.'
          : `فایل خروجی با ${toPersianDigits(result.rows)} ردیف آماده شد.`,
    });
  };

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle title="مدیریت درخواست‌ها" />
      <div className="mb-6 flex flex-col gap-3">
        <ChipGroup
          label="وضعیت"
          size="sm"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: ALL, label: 'همه وضعیت‌ها' },
            ...SERVICE_REQUEST_STATUSES.map((s) => ({
              value: s,
              label: SERVICE_REQUEST_STATUS_LABELS_FA[s],
            })),
          ]}
        />
        <ChipGroup
          label="نوع"
          size="sm"
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          options={[
            { value: ALL, label: 'همه انواع' },
            ...SERVICE_REQUEST_TYPES.map((t) => ({
              value: t,
              label: SERVICE_REQUEST_TYPE_LABELS_FA[t],
            })),
          ]}
        />
        <ChipGroup
          label="ارجاع"
          size="sm"
          value={assignee}
          onChange={(v) => {
            setAssignee(v);
            setPage(1);
          }}
          options={ASSIGNEE_FILTER_OPTIONS}
        />
        <div className="flex flex-wrap items-end gap-3">
          <FieldShell id="req-from" label="از تاریخ">
            <TextInput
              id="req-from"
              type="date"
              dir="ltr"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </FieldShell>
          <FieldShell
            id="req-to"
            label="تا تاریخ"
            error={rangeInvalid ? 'تاریخ شروع نباید بعد از تاریخ پایان باشد.' : undefined}
          >
            <TextInput
              id="req-to"
              type="date"
              dir="ltr"
              value={to}
              min={from || undefined}
              error={rangeInvalid ? 'تاریخ شروع نباید بعد از تاریخ پایان باشد.' : undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </FieldShell>
          <Button
            variant="ghost"
            disabled={exporting || rangeInvalid}
            onClick={() => void runExport()}
          >
            {exporting ? 'در حال آماده‌سازی…' : 'خروجی Excel (CSV)'}
          </Button>
        </div>
        <p className="text-[13px] text-ink-5">
          خروجی با همین فیلترها گرفته می‌شود، شامل اطلاعات شخصی متقاضیان است و ثبت می‌شود.
        </p>
        {exportMessage ? (
          exportMessage.ok ? (
            <SuccessMessage>{exportMessage.text}</SuccessMessage>
          ) : (
            <ErrorMessage>{exportMessage.text}</ErrorMessage>
          )
        ) : null}
      </div>
      <AsyncBoundary state={state} reload={reload}>
        {(items) => (
          <>
            <RequestList items={items} hrefBase="/dashboard/manage/requests" showRequester />
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
