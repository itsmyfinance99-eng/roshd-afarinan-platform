'use client';

import { Button } from '@roshd/ui';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <h1 className="text-2xl font-extrabold text-brand-900">مشکلی در نمایش این صفحه پیش آمد</h1>
      <p className="text-ink-4">
        لطفاً دوباره تلاش کنید. اگر مشکل ادامه داشت، با پشتیبانی تماس بگیرید.
      </p>
      <Button onClick={reset}>تلاش دوباره</Button>
    </main>
  );
}
