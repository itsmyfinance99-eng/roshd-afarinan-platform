import { describe, expect, it } from 'vitest';
import { checkUploadQuota } from './upload-quota';

const quota = { maxBytes: 100, maxFiles: 3 };

describe('checkUploadQuota', () => {
  it('allows uploads that fit', () => {
    expect(checkUploadQuota({ bytes: 0, files: 0 }, 100, quota)).toEqual({ allowed: true });
    expect(checkUploadQuota({ bytes: 60, files: 2 }, 40, quota)).toEqual({ allowed: true });
  });

  it('refuses when the next file exceeds the byte budget', () => {
    const decision = checkUploadQuota({ bytes: 60, files: 1 }, 41, quota);
    expect(decision).toMatchObject({ allowed: false, reason: 'bytes' });
  });

  it('refuses when the file count is already at the limit', () => {
    const decision = checkUploadQuota({ bytes: 0, files: 3 }, 1, quota);
    expect(decision).toMatchObject({ allowed: false, reason: 'files' });
  });

  it('explains the limit in Persian digits', () => {
    const decision = checkUploadQuota({ bytes: 0, files: 3 }, 1, quota);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.message).toContain('۳');
  });
});
