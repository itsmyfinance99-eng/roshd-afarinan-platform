'use client';

import { EmptyState, ErrorMessage } from '@roshd/ui';
import { useState } from 'react';
import { AsyncBoundary, PageTitle } from '@/components/dashboard/ui';
import { FileList, FileUploader, type FileItem } from '@/components/files/files';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

export default function MyFilesPage() {
  const { state, reload } = useApi<FileItem[]>('/files/mine?pageSize=100');
  const [error, setError] = useState<string | null>(null);

  const remove = async (file: FileItem) => {
    setError(null);
    const result = await apiFetch(`/files/${file.id}`, { method: 'DELETE' });
    if (result.ok) reload({ silent: true });
    else setError(result.message);
  };

  return (
    <>
      <PageTitle title="فایل‌های من" />
      <p className="mb-5 text-sm leading-loose text-ink-4">
        مدارک شما به‌صورت خصوصی نگهداری می‌شوند و فقط شما و کارشناسان مرتبط با درخواست‌تان به آن‌ها
        دسترسی دارند.
      </p>
      <div className="mb-6">
        <FileUploader
          purpose="USER_DOCUMENT"
          onUploaded={() => reload({ silent: true })}
          label="بارگذاری فایل"
        />
      </div>
      {error ? <ErrorMessage className="mb-4">{error}</ErrorMessage> : null}
      <AsyncBoundary state={state} reload={reload}>
        {(files) =>
          files.length === 0 ? (
            <EmptyState title="هنوز فایلی بارگذاری نکرده‌اید" />
          ) : (
            <FileList files={files} onRemove={(f) => void remove(f)} />
          )
        }
      </AsyncBoundary>
    </>
  );
}
