import { randomInt } from 'node:crypto';
import type { TicketStatus } from '@roshd/validation';

export type TicketActor = 'owner' | 'staff';

/**
 * Status after a new message:
 * - the owner writes → OPEN (waiting for staff),
 * - staff reply publicly → ANSWERED (waiting for the owner),
 * - internal notes never change the status.
 */
export function statusAfterMessage(
  current: TicketStatus,
  actor: TicketActor,
  internal: boolean,
): TicketStatus {
  if (internal) return current;
  return actor === 'owner' ? 'OPEN' : 'ANSWERED';
}

/** Closed tickets accept no new messages; the owner opens a new ticket instead. */
export function canPostMessage(current: TicketStatus): boolean {
  return current !== 'CLOSED';
}

/** Staff may set any status; the owner may only close their own ticket. */
export function canChangeStatus(actor: TicketActor, to: TicketStatus): boolean {
  return actor === 'staff' || to === 'CLOSED';
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateTicketCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `TK-${code}`;
}
