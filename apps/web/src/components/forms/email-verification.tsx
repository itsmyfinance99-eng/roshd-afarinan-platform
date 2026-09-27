'use client';

import { Button, cn, ErrorMessage, SuccessMessage } from '@roshd/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type State = { kind: 'working' } | { kind: 'done' } | { kind: 'failed'; message: string };

/**
 * Opens a verification link: posts the token once, then removes it from the address bar so it
 * does not linger in history or leak through a later referrer.
 */
export function VerifyEmail() {
  const params = useSearchParams();
  // Read once: the address bar is cleaned below, which also updates useSearchParams.
  const [token] = useState(() => params.get('token') ?? '');
  const [state, setState] = useState<State>({ kind: 'working' });
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    window.history.replaceState(null, '', '/verify-email');
    void apiFetch<null>('/auth/email/verify', { method: 'POST', body: { token } }).then((result) =>
      setState(result.ok ? { kind: 'done' } : { kind: 'failed', message: result.message }),
    );
  }, [token]);

  if (!token && state.kind === 'working') {
    return (
      <div className="flex flex-col gap-4">
        <ErrorMessage>لینک تأیید کامل نیست. از صفحه حساب کاربری لینک تازه بگیرید.</ErrorMessage>
        <Link href="/dashboard/profile" className="font-bold">
          رفتن به حساب کاربری
        </Link>
      </div>
    );
  }
  if (state.kind === 'working') {
    return (
      <p aria-busy="true" className="text-ink-4">
        در حال تأیید ایمیل…
      </p>
    );
  }
  if (state.kind === 'done') {
    return (
      <div className="flex flex-col gap-4">
        <SuccessMessage>ایمیل شما تأیید شد.</SuccessMessage>
        <Link href="/dashboard" className="font-bold">
          رفتن به داشبورد
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ErrorMessage>{state.message}</ErrorMessage>
      <Link href="/dashboard/profile" className="font-bold">
        درخواست لینک تازه از حساب کاربری
      </Link>
    </div>
  );
}

/** Verification status on the profile page, with a resend button while unverified. */
export function EmailVerificationStatus({ verifiedAt }: { verifiedAt: string | null }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const resend = async () => {
    setBusy(true);
    setMessage(null);
    const result = await apiFetch<{ message: string }>('/auth/email/resend', {
      method: 'POST',
      body: {},
    });
    setBusy(false);
    setMessage(
      result.ok
        ? { ok: true, text: 'لینک تأیید به ایمیل شما ارسال شد. صندوق ورودی را بررسی کنید.' }
        : { ok: false, text: result.message },
    );
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <span
        className={cn(
          'inline-block rounded-chip px-2 py-[3px] text-xs font-bold',
          verifiedAt ? 'bg-success-bg text-success-fg' : 'bg-notice-bg text-notice-fg',
        )}
      >
        {verifiedAt ? 'تأیید شده' : 'تأیید نشده'}
      </span>
      {verifiedAt ? null : (
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void resend()}>
            {busy ? 'در حال ارسال…' : 'ارسال دوباره لینک تأیید'}
          </Button>
          {message ? (
            message.ok ? (
              <SuccessMessage>{message.text}</SuccessMessage>
            ) : (
              <ErrorMessage>{message.text}</ErrorMessage>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
