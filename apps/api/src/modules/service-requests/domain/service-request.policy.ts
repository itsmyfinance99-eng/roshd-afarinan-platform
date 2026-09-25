import { randomInt } from 'node:crypto';
import { SERVICE_REQUEST_TRANSITIONS, type ServiceRequestStatus } from '@roshd/validation';

/** Allowed status changes (staff only), shared with the web dashboard via @roshd/validation. */
const TRANSITIONS = SERVICE_REQUEST_TRANSITIONS;

export function canTransition(from: ServiceRequestStatus, to: ServiceRequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: ServiceRequestStatus): readonly ServiceRequestStatus[] {
  return TRANSITIONS[from];
}

/** Crockford-style alphabet without I, L, O, U (no look-alikes when read over the phone). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Random public reference like RA-7K3M9QPD (≈40 bits; uniqueness enforced by the DB). */
export function generateTrackingCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `RA-${code}`;
}
