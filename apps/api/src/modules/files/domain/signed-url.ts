import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Short-lived download signatures: HMAC-SHA256 over `fileId.expiresAtEpochSeconds`.
 * The URL carries no user identity; it is issued only after an authorization check.
 */
export function signFileUrl(secret: string, fileId: string, expiresAt: number): string {
  return createHmac('sha256', secret).update(`${fileId}.${expiresAt}`).digest('base64url');
}

export type SignatureCheck = 'valid' | 'expired' | 'invalid';

export function verifyFileSignature(
  secret: string,
  fileId: string,
  expiresAt: number,
  signature: string,
  now: number = Math.floor(Date.now() / 1000),
): SignatureCheck {
  if (!Number.isInteger(expiresAt) || !signature) return 'invalid';
  const expected = Buffer.from(signFileUrl(secret, fileId, expiresAt));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
  return expiresAt < now ? 'expired' : 'valid';
}
