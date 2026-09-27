'use client';

import {
  Button,
  ChipGroup,
  ErrorMessage,
  FieldShell,
  formatDateTimeFa,
  TextInput,
} from '@roshd/ui';
import {
  ALL_FILE_PURPOSES,
  FILE_PURPOSE_LABELS_FA,
  FILE_STATUS_LABELS_FA,
  FILE_STATUSES,
  type AnyFilePurpose,
  type FileStatus,
} from '@roshd/validation';
import { useState } from 'react';
import { useCan } from '@/components/dashboard/me-context';
import { AsyncBoundary, PageTitle, Pagination } from '@/components/dashboard/ui';
import { downloadFile, formatSize } from '@/components/files/files';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

const PAGE_SIZE = 20;
const ALL = 'ALL';

interface StaffFile {
  id: string;
  purpose: AnyFilePurpose;
  entityType: string | null;
  entityId: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  checksum: string;
  status: FileStatus;
  deletedAt: string | null;
  createdAt: string;
  owner: { id: string; fullName: string; email: string } | null;
}

/** Staff file browser (ST-27.02): `files:read-all` had neither an endpoint nor a page before. */
export default function ManageFilesPage() {
  const allowed = useCan('files:read-all');
  const [purpose, setPurpose] = useState<string>(ALL);
  const [status, setStatus] = useState<FileStatus>('ACTIVE');
  const [owner, setOwner] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const query = new URLSearchParams({ status, page: String(page), pageSize: String(PAGE_SIZE) });
  if (purpose !== ALL) query.set('purpose', purpose);
  if (search) query.set('owner', search);
  const { state, reload } = useApi<StaffFile[]>(allowed ? `/files?${query.toString()}` : null);

  const remove = async (file: StaffFile) => {
    setError(null);
    const attached = Boolean(file.entityId);
    const confirmed = window.confirm(
      attached
        ? `«${file.originalName}» به یک رکورد پیوست شده است. با حذف، پیوست آن رکورد از بین می‌رود. حذف شود؟`
        : `«${file.originalName}» حذف شود؟`,
    );
    if (!confirmed) return;
    const result = await apiFetch(`/files/${file.id}`, { method: 'DELETE' });
    if (result.ok) reload({ silent: true });
    else setError(result.message);
  };

  if (!allowed) return <ErrorMessage>اجازه دسترسی به این بخش را ندارید.</ErrorMessage>;

  return (
    <>
      <PageTitle title="فایل‌های کاربران" />
      <p className="mb-5 text-sm leading-loose text-ink-4">
        فایل‌ها خصوصی می‌مانند؛ دریافت هر فایل با یک پیوند امضاشده و کوتاه‌مدت انجام می‌شود و حذف
        کارکنان در گزارش رویدادها ثبت می‌شود.
      </p>
      <div className="mb-6 flex flex-col gap-3">
        <ChipGroup
          label="نوع"
          size="sm"
          value={purpose}
          onChange={(v) => {
            setPurpose(v);
            setPage(1);
          }}
          options={[
            { value: ALL, label: 'همه نوع‌ها' },
            ...ALL_FILE_PURPOSES.map((p) => ({ value: p, label: FILE_PURPOSE_LABELS_FA[p] })),
          ]}
        />
        <ChipGroup
          label="وضعیت"
          size="sm"
          value={status}
          onChange={(v) => {
            setStatus(v as FileStatus);
            setPage(1);
          }}
          options={FILE_STATUSES.map((s) => ({ value: s, label: FILE_STATUS_LABELS_FA[s] }))}
        />
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(owner.trim());
            setPage(1);
          }}
        >
          <FieldShell id="file-owner" label="مالک" hint="نام یا ایمیل کاربر">
            <TextInput id="file-owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </FieldShell>
          <Button type="submit" size="sm">
            جست‌وجو
          </Button>
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOwner('');
                setSearch('');
                setPage(1);
              }}
            >
              حذف جست‌وجو
            </Button>
          ) : null}
        </form>
      </div>
      {error ? <ErrorMessage className="mb-4">{error}</ErrorMessage> : null}
      <AsyncBoundary state={state} reload={reload}>
        {(files) =>
          files.length === 0 ? (
            <p className="text-sm text-ink-5">فایلی با این فیلترها یافت نشد.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-bold text-ink-2">{file.originalName}</span>
                      <span className="text-xs text-ink-5">
                        {file.owner?.fullName ?? 'کاربر حذف‌شده'}
                        {file.owner ? (
                          <>
                            {' · '}
                            <span dir="ltr">{file.owner.email}</span>
                          </>
                        ) : null}
                        {' · '}
                        {FILE_PURPOSE_LABELS_FA[file.purpose]} · {formatSize(file.size)} ·{' '}
                        {formatDateTimeFa(file.createdAt)}
                        {file.entityId ? ' · پیوست‌شده' : ''}
                      </span>
                    </span>
                    {file.status === 'ACTIVE' ? (
                      <span className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void downloadFile(file.id).then(setError)}
                          aria-label={`دریافت ${file.originalName}`}
                        >
                          دریافت
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void remove(file)}
                          aria-label={`حذف ${file.originalName}`}
                        >
                          حذف
                        </Button>
                      </span>
                    ) : (
                      <span className="text-xs text-ink-5">
                        {file.deletedAt
                          ? `حذف‌شده در ${formatDateTimeFa(file.deletedAt)}`
                          : 'حذف‌شده'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {state.status === 'success' ? (
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={state.meta?.total ?? files.length}
                  onChange={setPage}
                />
              ) : null}
            </>
          )
        }
      </AsyncBoundary>
    </>
  );
}
