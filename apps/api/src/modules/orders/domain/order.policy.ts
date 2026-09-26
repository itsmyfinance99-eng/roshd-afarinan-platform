import { randomInt } from 'node:crypto';
import type { OrderStatus } from '@roshd/validation';

/**
 * Order state machine:
 *   PENDING_PAYMENT ──verified payment──▶ PAID (terminal; refunds are out of scope in Phase 1)
 *   PENDING_PAYMENT ──customer cancels──▶ CANCELLED (terminal)
 * Payment attempts may be retried any number of times while the order is PENDING_PAYMENT.
 */
export type OrderDecision = { ok: true } | { ok: false; reason: 'paid' | 'cancelled' };

export function canStartPayment(status: OrderStatus): OrderDecision {
  if (status === 'PAID') return { ok: false, reason: 'paid' };
  if (status === 'CANCELLED') return { ok: false, reason: 'cancelled' };
  return { ok: true };
}

export function canCancel(status: OrderStatus): OrderDecision {
  return canStartPayment(status);
}

/** Exact integer arithmetic on whole rials. */
export function orderTotal(items: readonly { unitPriceRials: bigint; quantity: number }[]): bigint {
  return items.reduce((sum, item) => sum + item.unitPriceRials * BigInt(item.quantity), 0n);
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Public order code like OR-7K3M9QPD (uniqueness enforced by the DB). */
export function generateOrderCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `OR-${code}`;
}
