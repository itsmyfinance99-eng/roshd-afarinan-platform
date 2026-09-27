'use client';

import { Button, buttonClasses, ErrorMessage } from '@roshd/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useSessionHint } from '@/lib/session';

/**
 * Online purchase of a priced course: creates (or reopens) a pending order and moves to its
 * page, where payment starts. The price is always computed on the server.
 */
export function BuyCourseButton({ slug }: { slug: string }) {
  const router = useRouter();
  const signedIn = useSessionHint();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/training/${slug}`)}`}
        className={buttonClasses('outline', 'lg', 'no-underline')}
      >
        ورود برای خرید آنلاین
      </Link>
    );
  }

  const buy = async () => {
    setBusy(true);
    setError(null);
    const result = await apiFetch<{ id: string }>('/orders', {
      method: 'POST',
      body: { items: [{ kind: 'COURSE', slug }] },
    });
    if (result.ok) {
      router.push(`/dashboard/orders/${result.data.id}`);
      return;
    }
    setBusy(false);
    setError(result.message);
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" size="lg" disabled={busy} onClick={() => void buy()}>
        {busy ? 'در حال ثبت سفارش…' : 'خرید و پرداخت آنلاین'}
      </Button>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </div>
  );
}
