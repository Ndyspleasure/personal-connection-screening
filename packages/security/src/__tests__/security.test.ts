import { describe, expect, it } from 'vitest';
import {
  AppError,
  InMemoryRateLimiter,
  clearedSessionCookieOptions,
  fingerprintToken,
  generatePublicRef,
  generateSessionToken,
  isRequestOriginValid,
  referenceKindOf,
  safeEqualHex,
  sessionCookieOptions,
  toPublicError,
  uuidv7,
} from '../index';

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('produces RFC 4122 version-7 UUIDs', () => {
    expect(uuidv7()).toMatch(UUID_V7_RE);
  });
  it('is unique across many calls', () => {
    const set = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(set.size).toBe(1000);
  });
});

describe('public references', () => {
  it('are prefixed, opaque and round-trip to their kind', () => {
    const ref = generatePublicRef('session');
    expect(ref.startsWith('ses_')).toBe(true);
    expect(referenceKindOf(ref)).toBe('session');
  });
  it('are non-sequential / high entropy', () => {
    const a = generatePublicRef('verification');
    const b = generatePublicRef('verification');
    expect(a).not.toBe(b);
  });
  it('returns null for unknown prefixes', () => {
    expect(referenceKindOf('zzz_whatever')).toBeNull();
  });
});

describe('session tokens', () => {
  it('fingerprint is deterministic per secret and secret-dependent', () => {
    const token = generateSessionToken();
    expect(fingerprintToken(token, 's1')).toBe(fingerprintToken(token, 's1'));
    expect(fingerprintToken(token, 's1')).not.toBe(fingerprintToken(token, 's2'));
  });
  it('safeEqualHex compares fingerprints correctly', () => {
    const fp = fingerprintToken('tok', 'secret');
    expect(safeEqualHex(fp, fp)).toBe(true);
    expect(safeEqualHex(fp, fingerprintToken('other', 'secret'))).toBe(false);
    expect(safeEqualHex(fp, 'short')).toBe(false);
  });
  it('generates unique tokens', () => {
    const set = new Set(Array.from({ length: 500 }, () => generateSessionToken()));
    expect(set.size).toBe(500);
  });
});

describe('cookies', () => {
  it('session cookie is HttpOnly and (in prod) Secure with SameSite=Lax', () => {
    const opts = sessionCookieOptions({ secure: true, maxAgeSeconds: 3600 });
    expect(opts).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });
  });
  it('cleared cookie has maxAge 0', () => {
    expect(clearedSessionCookieOptions(true).maxAge).toBe(0);
  });
});

describe('csrf / origin validation', () => {
  const allowed = ['https://connect.example.com'];
  it('allows safe methods without an origin', () => {
    expect(isRequestOriginValid({ method: 'GET', origin: null, allowedOrigins: allowed })).toBe(
      true,
    );
  });
  it('rejects state-changing requests from disallowed origins', () => {
    expect(
      isRequestOriginValid({ method: 'POST', origin: 'https://evil.com', allowedOrigins: allowed }),
    ).toBe(false);
    expect(isRequestOriginValid({ method: 'POST', origin: null, allowedOrigins: allowed })).toBe(
      false,
    );
  });
  it('allows state-changing requests from allowed origins', () => {
    expect(
      isRequestOriginValid({
        method: 'POST',
        origin: 'https://connect.example.com',
        allowedOrigins: allowed,
      }),
    ).toBe(true);
  });
});

describe('safe errors', () => {
  it('maps AppError to its code and status without leaking internals', () => {
    const err = new AppError('SESSION_EXPIRED', 'internal: session row 42 expired at ...', {
      secret: 'do-not-leak',
    });
    const pub = toPublicError(err);
    expect(pub.status).toBe(410);
    expect(pub.body.error.code).toBe('SESSION_EXPIRED');
    expect(JSON.stringify(pub)).not.toContain('do-not-leak');
    expect(JSON.stringify(pub)).not.toContain('row 42');
  });
  it('maps unknown errors to a generic system error', () => {
    const pub = toPublicError(new Error('DB password is hunter2'));
    expect(pub.status).toBe(503);
    expect(pub.body.error.code).toBe('TEMPORARY_SYSTEM_ERROR');
    expect(JSON.stringify(pub)).not.toContain('hunter2');
  });
});

describe('in-memory rate limiter', () => {
  it('allows up to the limit then blocks within the window', async () => {
    const rl = new InMemoryRateLimiter(3, 60);
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await rl.limit('key')).success);
    expect(results).toEqual([true, true, true, false]);
  });
  it('isolates keys', async () => {
    const rl = new InMemoryRateLimiter(1, 60);
    expect((await rl.limit('a')).success).toBe(true);
    expect((await rl.limit('b')).success).toBe(true);
    expect((await rl.limit('a')).success).toBe(false);
  });
});
