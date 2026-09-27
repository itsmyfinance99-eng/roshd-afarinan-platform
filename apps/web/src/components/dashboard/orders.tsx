'use client';

import {
  Button,
  cn,
  EmptyState,
  ErrorMessage,
  formatDateTimeFa,
  formatRials,
  Notice,
  SuccessMessage,
  toPersianDigits,
} from '@roshd/ui';
import {
  ORDER_STATUS_LABELS_FA,
  PAYMENT_ATTEMPT_STATUS_LABELS_FA,
  type OrderStatus,
  type PaymentAttemptStatus,
} from '@roshd/validation';
import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';

/** Mirrors the API order view (money as digit strings). */
export interface OrderItemView {
  id: string;
  kind: 'COURSE';
  referenceSlug: string;
  title: string;
  unitPriceRials: string;
  quantity: number;
}

export interface OrderView {
  id: string;
  code: string;
  status: OrderStatus;
  totalRials: string;
  paidAt: string | null;
  createdAt: string;
  items: OrderItemView[];
  attempts: {
    id: string;
    status: PaymentAttemptStatus;
    amountRials: string;
    trackingCode: string | null;
    cardMask: string | null;
    failureReason: string | null;
    createdAt: string;
  }[];
}

const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-notice-bg text-notice-fg',
  PAID: 'bg-success-bg text-success-fg',
  CANCELLED: 'bg-surface-2 text-ink-4',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        'inline-block rounded-chip px-2 py-[3px] text-xs font-bold',
        STATUS_TONE[status],
      )}
    >
      {ORDER_STATUS_LABELS_FA[status]}
    </span>
  );
}

export function OrderList({ items }: { items: OrderView[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="هنوز سفارشی ثبت نکرده‌اید"
        description="دوره‌های قابل خرید آنلاین را در بخش آموزش ببینید."
        action={
          <Link href="/training" className="font-bold no-underline">
            مشاهده دوره‌ها ‹
          </Link>
        }
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((order) => (
        <li key={order.id}>
          <Link
            href={`/dashboard/orders/${order.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4 text-ink no-underline hover:border-line-hover hover:text-ink"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-bold">{order.items.map((i) => i.title).join('، ')}</span>
              <span className="text-[13px] text-ink-5">
                <span dir="ltr">{toPersianDigits(order.code)}</span> ·{' '}
                {formatRials(order.totalRials)} · {formatDateTimeFa(order.createdAt)}
              </span>
            </span>
            <OrderStatusBadge status={order.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The finance list and detail name the customer (ST-27.01). */
export interface StaffOrderView extends OrderView {
  customer: { id: string; fullName: string; email: string } | null;
}

export function StaffOrderList({ items }: { items: StaffOrderView[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="سفارشی با این فیلترها یافت نشد"
        description="وضعیت دیگری را انتخاب کنید یا جست‌وجوی کد را بردارید."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((order) => (
        <li key={order.id}>
          <Link
            href={`/dashboard/manage/orders/${order.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4 text-ink no-underline hover:border-line-hover hover:text-ink"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-bold">
                <span dir="ltr">{toPersianDigits(order.code)}</span> ·{' '}
                {formatRials(order.totalRials)}
              </span>
              <span className="text-[13px] text-ink-5">
                {order.customer?.fullName ?? 'کاربر حذف‌شده'} ·{' '}
                {order.items.map((i) => i.title).join('، ')} · {formatDateTimeFa(order.createdAt)}
              </span>
            </span>
            <OrderStatusBadge status={order.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Read-only detail for finance: no pay or cancel button, and every attempt is shown in full. */
export function StaffOrderDetail({ order }: { order: StaffOrderView }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-4">
        <OrderStatusBadge status={order.status} />
        <span dir="ltr">{toPersianDigits(order.code)}</span>
        <span>ثبت: {formatDateTimeFa(order.createdAt)}</span>
        {order.paidAt ? <span>پرداخت: {formatDateTimeFa(order.paidAt)}</span> : null}
      </div>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 rounded-card bg-surface p-4 text-sm">
        <div>
          <dt className="text-ink-5">مشتری</dt>
          <dd className="font-bold">{order.customer?.fullName ?? 'کاربر حذف‌شده'}</dd>
        </div>
        {order.customer ? (
          <div>
            <dt className="text-ink-5">ایمیل</dt>
            <dd dir="ltr">{order.customer.email}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-ink-5">جمع کل</dt>
          <dd className="font-extrabold text-brand-900">{formatRials(order.totalRials)}</dd>
        </div>
      </dl>

      <table className="w-full border-collapse text-[15px]">
        <caption className="sr-only">اقلام سفارش</caption>
        <thead>
          <tr className="border-b border-line text-start text-sm text-ink-5">
            <th scope="col" className="py-2 text-start font-semibold">
              قلم
            </th>
            <th scope="col" className="py-2 text-end font-semibold">
              مبلغ
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-line-2">
              <td className="py-3">{item.title}</td>
              <td className="py-3 text-end">{formatRials(item.unitPriceRials)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section aria-labelledby="staff-attempts-title">
        <h2 id="staff-attempts-title" className="mb-2 text-sm font-bold text-ink-2">
          تلاش‌های پرداخت
        </h2>
        {order.attempts.length === 0 ? (
          <p className="text-sm text-ink-5">هنوز تلاش پرداختی ثبت نشده است.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {order.attempts.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 rounded-card bg-surface p-3">
                <span className="font-bold">
                  {PAYMENT_ATTEMPT_STATUS_LABELS_FA[a.status]} · {formatRials(a.amountRials)} ·{' '}
                  {formatDateTimeFa(a.createdAt)}
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-ink-4">
                  {a.trackingCode ? (
                    <span>
                      کد رهگیری: <span dir="ltr">{a.trackingCode}</span>
                    </span>
                  ) : null}
                  {a.cardMask ? (
                    <span>
                      کارت: <span dir="ltr">{toPersianDigits(a.cardMask)}</span>
                    </span>
                  ) : null}
                  {a.failureReason ? <span>علت: {a.failureReason}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Order detail with pay/cancel. The `payment` hint from the gateway return is only a message
 * cue: the status shown always comes from the API (server-side verification).
 */
export function OrderDetail({
  order,
  paymentHint,
  onChanged,
}: {
  order: OrderView;
  paymentHint: string | null;
  onChanged: () => void;
}) {
  const payment = useApi<{ enabled: boolean; testMode: boolean }>('/payments/status');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = order.status === 'PENDING_PAYMENT';
  const paymentEnabled = payment.state.status === 'success' && payment.state.data.enabled;

  const pay = async () => {
    setBusy(true);
    setError(null);
    const result = await apiFetch<{ redirectUrl: string }>(`/orders/${order.id}/pay`, {
      method: 'POST',
      body: {},
    });
    if (result.ok) {
      window.location.assign(result.data.redirectUrl);
      return;
    }
    setBusy(false);
    setError(result.message);
  };

  const cancel = async () => {
    setBusy(true);
    setError(null);
    const result = await apiFetch(`/orders/${order.id}/cancel`, { method: 'POST', body: {} });
    setBusy(false);
    if (result.ok) onChanged();
    else setError(result.message);
  };

  return (
    <div className="flex flex-col gap-6">
      {order.status === 'PAID' ? (
        <SuccessMessage>
          پرداخت این سفارش تأیید شده است
          {order.paidAt ? ` (${formatDateTimeFa(order.paidAt)})` : ''}.
        </SuccessMessage>
      ) : paymentHint === 'failed' && pending ? (
        <ErrorMessage>پرداخت انجام نشد یا تأیید نشد. می‌توانید دوباره تلاش کنید.</ErrorMessage>
      ) : paymentHint === 'paid' && pending ? (
        <Notice>نتیجه پرداخت هنوز تأیید نشده است. چند لحظه بعد صفحه را تازه کنید.</Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-4">
        <OrderStatusBadge status={order.status} />
        <span dir="ltr">{toPersianDigits(order.code)}</span>
        <span>ثبت: {formatDateTimeFa(order.createdAt)}</span>
      </div>

      <table className="w-full border-collapse text-[15px]">
        <caption className="sr-only">اقلام سفارش</caption>
        <thead>
          <tr className="border-b border-line text-start text-sm text-ink-5">
            <th scope="col" className="py-2 text-start font-semibold">
              قلم
            </th>
            <th scope="col" className="py-2 text-end font-semibold">
              مبلغ
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-line-2">
              <td className="py-3">
                <Link href={`/training/${item.referenceSlug}`}>{item.title}</Link>
              </td>
              <td className="py-3 text-end">{formatRials(item.unitPriceRials)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="py-3 text-start">
              جمع کل
            </th>
            <td className="py-3 text-end font-extrabold text-brand-900">
              {formatRials(order.totalRials)}
            </td>
          </tr>
        </tfoot>
      </table>

      {pending ? (
        <div className="flex flex-col gap-3">
          {payment.state.status === 'success' && !paymentEnabled ? (
            <Notice>پرداخت آنلاین در حال حاضر فعال نیست. برای هماهنگی با ما تماس بگیرید.</Notice>
          ) : null}
          {paymentEnabled && payment.state.status === 'success' && payment.state.data.testMode ? (
            <Notice>درگاه آزمایشی فعال است؛ هیچ مبلغ واقعی پرداخت نمی‌شود.</Notice>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy || !paymentEnabled} onClick={() => void pay()}>
              {busy ? 'در حال انتقال…' : 'پرداخت آنلاین'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void cancel()}>
              لغو سفارش
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      {order.attempts.length > 0 ? (
        <section aria-labelledby="attempts-title">
          <h2 id="attempts-title" className="mb-2 text-sm font-bold text-ink-2">
            تلاش‌های پرداخت
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {order.attempts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap justify-between gap-2 rounded-card bg-surface p-3"
              >
                <span>
                  {PAYMENT_ATTEMPT_STATUS_LABELS_FA[a.status]} · {formatDateTimeFa(a.createdAt)}
                </span>
                {a.trackingCode ? (
                  <span>
                    کد رهگیری: <span dir="ltr">{a.trackingCode}</span>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
