import { describe, expect, it } from 'vitest';
import {
  canChangeStatus,
  canPostMessage,
  generateTicketCode,
  statusAfterMessage,
} from './ticket.policy';

describe('ticket policy', () => {
  it('moves between waiting-for-staff and waiting-for-owner', () => {
    expect(statusAfterMessage('ANSWERED', 'owner', false)).toBe('OPEN');
    expect(statusAfterMessage('OPEN', 'staff', false)).toBe('ANSWERED');
    expect(statusAfterMessage('PENDING', 'staff', false)).toBe('ANSWERED');
  });

  it('keeps the status for internal notes', () => {
    expect(statusAfterMessage('PENDING', 'staff', true)).toBe('PENDING');
  });

  it('blocks messages on closed tickets', () => {
    expect(canPostMessage('CLOSED')).toBe(false);
    expect(canPostMessage('ANSWERED')).toBe(true);
  });

  it('lets owners only close their ticket', () => {
    expect(canChangeStatus('owner', 'CLOSED')).toBe(true);
    expect(canChangeStatus('owner', 'PENDING')).toBe(false);
    expect(canChangeStatus('staff', 'PENDING')).toBe(true);
  });

  it('generates unambiguous codes', () => {
    expect(generateTicketCode()).toMatch(/^TK-[0-9A-HJKMNP-TV-Z]{6}$/);
  });
});
