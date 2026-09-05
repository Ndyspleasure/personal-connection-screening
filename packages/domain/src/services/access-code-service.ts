import {
  consumeAccessCode,
  getAccessCodeByKindAndHash,
  type AccessCode,
  type Database,
} from '@pcs/db';
import { AppError, fingerprintToken } from '@pcs/security';

/**
 * AccessCodeService — server-side verification for gated sessions (Pendekatan).
 *
 * The browser never holds the code list and codes are never stored in plaintext
 * (Threat TH-001/002; phase spec "Keamanan Kode"): only a deterministic,
 * non-reversible HMAC fingerprint is compared. Consuming a use is a single
 * concurrency-safe atomic UPDATE, so a usage cap cannot be exceeded under
 * simultaneous requests. Expiry and usage are checked on the server, never the
 * client. Failure reasons map to safe typed errors that never leak internals.
 */

/** Normalise so trivial variations (case, surrounding whitespace) still match. */
export function normalizeAccessCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Deterministic, non-reversible fingerprint used for both storage and lookup. */
export function hashAccessCode(raw: string, secret: string): string {
  return fingerprintToken(normalizeAccessCode(raw), secret);
}

export const accessCodeService = {
  /**
   * Verify + atomically consume one use of a code for a session kind. Returns
   * the consumed code row on success; throws a typed AppError otherwise. The
   * consume is authoritative; a second read only classifies the failure so the
   * UI can show an appropriate (still non-leaky) message.
   */
  async verifyAndConsume(
    db: Database,
    secret: string,
    input: { sessionKindId: string; code: string; now?: Date },
  ): Promise<AccessCode> {
    const now = input.now ?? new Date();
    const codeHash = hashAccessCode(input.code, secret);

    const consumed = await consumeAccessCode(db, {
      sessionKindId: input.sessionKindId,
      codeHash,
      now,
    });
    if (consumed) return consumed;

    const existing = await getAccessCodeByKindAndHash(db, {
      sessionKindId: input.sessionKindId,
      codeHash,
    });
    if (!existing || existing.status !== 'ACTIVE') throw new AppError('ACCESS_CODE_INVALID');
    if (existing.expiresAt && existing.expiresAt.getTime() <= now.getTime()) {
      throw new AppError('ACCESS_CODE_EXPIRED');
    }
    if (existing.maxUses != null && existing.useCount >= existing.maxUses) {
      throw new AppError('ACCESS_CODE_EXHAUSTED');
    }
    throw new AppError('ACCESS_CODE_INVALID');
  },
};
