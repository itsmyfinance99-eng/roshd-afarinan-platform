import { trackServiceRequestSchema } from '@roshd/validation';
import { describe, expect, it } from 'vitest';
import { canTransition, generateTrackingCode, nextStatuses } from './service-request.policy';

describe('service request policy', () => {
  it('allows the review lifecycle and reopening', () => {
    expect(canTransition('NEW', 'IN_REVIEW')).toBe(true);
    expect(canTransition('IN_REVIEW', 'RESPONDED')).toBe(true);
    expect(canTransition('RESPONDED', 'CLOSED')).toBe(true);
    expect(canTransition('CLOSED', 'IN_REVIEW')).toBe(true);
  });

  it('rejects skipping review or no-op transitions', () => {
    expect(canTransition('NEW', 'RESPONDED')).toBe(false);
    expect(canTransition('NEW', 'NEW')).toBe(false);
    expect(nextStatuses('CLOSED')).toEqual(['IN_REVIEW']);
  });

  it('generates tracking codes that the public tracking schema accepts', () => {
    const codes = new Set(Array.from({ length: 500 }, generateTrackingCode));
    expect(codes.size).toBe(500);
    for (const code of codes) {
      expect(code).toMatch(/^RA-[0-9A-HJKMNP-TV-Z]{8}$/);
      expect(trackServiceRequestSchema.safeParse({ code, mobile: '09121234567' }).success).toBe(
        true,
      );
    }
  });
});
