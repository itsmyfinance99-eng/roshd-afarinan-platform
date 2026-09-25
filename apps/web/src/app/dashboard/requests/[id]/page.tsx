'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ServiceRequestDetail } from '@/components/dashboard/types';
import {
  AsyncBoundary,
  PageTitle,
  RequestDetails,
  StatusTimeline,
} from '@/components/dashboard/ui';
import { FileList } from '@/components/files/files';
import { useApi } from '@/lib/use-api';

export default function MyRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, reload } = useApi<ServiceRequestDetail>(
    `/service-requests/${encodeURIComponent(id)}`,
  );

  return (
    <>
      <PageTitle
        title="جزئیات درخواست"
        action={
          <Link href="/dashboard/requests" className="text-sm no-underline">
            بازگشت به فهرست ‹
          </Link>
        }
      />
      <AsyncBoundary state={state} reload={reload}>
        {(item) => (
          <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
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
            </div>
            <section aria-labelledby="timeline-title">
              <h2 id="timeline-title" className="mb-4 text-base font-extrabold text-brand-900">
                روند بررسی
              </h2>
              <StatusTimeline events={item.events} />
            </section>
          </div>
        )}
      </AsyncBoundary>
    </>
  );
}
