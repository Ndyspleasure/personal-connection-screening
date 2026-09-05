import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SESSION_TOKEN_ENTROPY_BYTES } from '@pcs/config';

/**
 * Public session token design (Technology Architecture §13; Threat Model
 * TH-001/002/006). The raw token lives ONLY in the client cookie; the database
 * stores an HMAC fingerprint, never the raw token in plaintext.
 */
export function generateSessionToken(entropyBytes = SESSION_TOKEN_ENTROPY_BYTES): string {
  return randomBytes(entropyBytes).toString('base64url');
}

/** Deterministic HMAC-SHA256 fingerprint used for server-side token lookup. */
export function fingerprintToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

/** Constant-time comparison of two hex fingerprints (no early length leak beyond size). */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
