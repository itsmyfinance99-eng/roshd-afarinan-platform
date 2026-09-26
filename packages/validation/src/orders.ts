import { z } from 'zod';
import { paginationQuerySchema, slugSchema } from './common';

export const ORDER_STATUSES = ['PENDING_PAYMENT', 'PAID', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_ATTEMPT_STATUSES = ['INITIATED', 'VERIFIED', 'FAILED'] as const;
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

export const ORDER_STATUS_LABELS_FA: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  CANCELLED: 'لغوشده',
};

export const PAYMENT_ATTEMPT_STATUS_LABELS_FA: Record<PaymentAttemptStatus, string> = {
  INITIATED: 'در حال پرداخت',
  VERIFIED: 'موفق',
  FAILED: 'ناموفق',
};

/** Phase 1 sells published, priced courses only; prices are always read on the server. */
export const createOrderSchema = z.object({
  items: z
    .array(z.object({ kind: z.literal('COURSE'), slug: slugSchema }))
    .min(1, { error: 'سفارش باید دست‌کم یک قلم داشته باشد.' })
    .max(10)
    .refine((items) => new Set(items.map((i) => i.slug)).size === items.length, {
      error: 'هر قلم فقط یک بار می‌تواند در سفارش باشد.',
    }),
});

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
