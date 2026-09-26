import { buttonClasses, Container, Notice } from '@roshd/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { mockGatewayEnabled } from '@/lib/env';

export const metadata: Metadata = {
  title: 'درگاه پرداخت آزمایشی',
  robots: { index: false, follow: false },
};

/** Only our own callback path is accepted, so this page can never become an open redirect. */
const CALLBACK_PATH = /^\/api\/v1\/payments\/callback\/[0-9a-f-]{36}$/;

/**
 * Development stand-in for a PSP page, used only by the mock gateway (PAYMENT_PROVIDER=mock,
 * refused in production). No money moves; the API still verifies the result server-to-server.
 * Production builds return 404 unless ENABLE_MOCK_GATEWAY=true.
 */
export default async function MockGatewayPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ callback?: string | string[] }>;
}) {
  if (!mockGatewayEnabled()) notFound();
  const { ref } = await params;
  const { callback } = await searchParams;
  if (!/^MOCK-[0-9A-Z]{16}$/.test(ref) || typeof callback !== 'string') notFound();
  let path: string;
  try {
    path = new URL(callback, 'http://placeholder').pathname;
  } catch {
    notFound();
  }
  if (!CALLBACK_PATH.test(path)) notFound();

  return (
    <Container className="max-w-xl py-16">
      <h1 className="mb-4 text-2xl font-extrabold text-brand-900">درگاه پرداخت آزمایشی</h1>
      <Notice className="mb-6">
        این صفحه فقط برای توسعه و آزمایش است و هیچ مبلغ واقعی پرداخت نمی‌شود. نتیجه نهایی را سرور با
        استعلام از درگاه تعیین می‌کند.
      </Notice>
      <p className="mb-6 text-sm text-ink-4">
        شناسه تراکنش: <span dir="ltr">{ref}</span>
      </p>
      <div className="flex flex-wrap gap-3">
        {/* Plain links: the callback is an API route, not a page. */}
        <a href={`${path}?status=OK`} className={buttonClasses('primary', 'md')}>
          پرداخت موفق
        </a>
        <a href={`${path}?status=CANCELLED`} className={buttonClasses('ghost', 'md')}>
          انصراف از پرداخت
        </a>
      </div>
    </Container>
  );
}
