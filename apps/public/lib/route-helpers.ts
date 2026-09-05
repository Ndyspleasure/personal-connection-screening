import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { RATE_LIMITS, publicEnv, type RateLimitOperation } from '@pcs/config';
import { getServerEnv } from '@pcs/config/server';
import { getDb, type Database } from '@pcs/db';
import { auditService, sessionService, type CandidateActor } from '@pcs/domain';
import {
  AppError,
  SESSION_COOKIE_NAME,
  clearedSessionCookieOptions,
  createRateLimiter,
  isRequestOriginValid,
  logServerError,
  sessionCookieOptions,
  toPublicError,
  type RateLimiter,
} from '@pcs/security';
import { safeParse } from '@pcs/validation';

/** Structural type for anything Zod-like our routes accept. Avoids a hard dep on `zod`. */
type ParseableSchema<T> = {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
};

/**
 * Route helpers for the public API (Technology Architecture §22, §72).
 *
 * Every route funnels through one of these helpers so authorization, origin
 * validation, payload parsing, error mapping, and rate limiting all live in
 * one enforceable spot. The route handler itself becomes thin (Tech §23).
 */

/** Resolve db, env, and today's rate limiters once per module. */
export function db(): Database {
  return getDb();
}

const limiters: Partial<Record<RateLimitOperation, RateLimiter>> = {};
export function limiterFor(op: RateLimitOperation): RateLimiter {
  const cached = limiters[op];
  if (cached) return cached;
  const env = getServerEnv();
  const fresh = createRateLimiter(
    op,
    RATE_LIMITS[op],
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }
      : undefined,
  );
  limiters[op] = fresh;
  return fresh;
}

/** Best-effort IP for rate limiting (Threat §29 — signal only, never identity). */
export function requestIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** Uniform JSON error response with the safe body from @pcs/security. */
export function toErrorResponse(err: unknown): NextResponse {
  const pub = toPublicError(err);
  // Server-side observability for unexpected failures only; 4xx are expected
  // control flow and stay quiet (Tech §55).
  if (pub.status >= 500) logServerError(err, { correlationId: randomUUID(), app: 'public' });
  return NextResponse.json(pub.body, { status: pub.status });
}

/** Enforce Origin on state-changing requests (Threat TH-049). */
export function ensureOriginAllowed(req: NextRequest): void {
  const env = getServerEnv();
  if (
    !isRequestOriginValid({
      method: req.method,
      origin: req.headers.get('origin'),
      allowedOrigins: env.PUBLIC_ALLOWED_ORIGINS,
    })
  ) {
    throw new AppError('NOT_AUTHORIZED', 'origin not allowed');
  }
}

/** Parse untrusted JSON with a Zod-shaped schema; throws VALIDATION_ERROR on failure. */
export async function parseJson<T>(req: NextRequest, schema: ParseableSchema<T>): Promise<T> {
  let body: unknown = {};
  const contentType = req.headers.get('content-type') ?? '';
  if (req.method !== 'GET' && contentType.includes('application/json')) {
    try {
      body = await req.json();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'invalid JSON');
    }
  }
  // Reuse the runtime helper but preserve the caller's T through the wrapper's shape.
  const parsed = safeParse(schema as unknown as Parameters<typeof safeParse<T>>[0], body);
  if (!parsed.ok) throw new AppError('VALIDATION_ERROR', parsed.issues.join('; '));
  return parsed.data;
}

/** Attach a fresh public session cookie carrying only the raw opaque token. */
export async function setSessionCookie(rawToken: string, expiresAt: Date): Promise<void> {
  const nowMs = Date.now();
  const maxAge = Math.max(1, Math.floor((expiresAt.getTime() - nowMs) / 1000));
  const opts = sessionCookieOptions({
    secure: publicEnv.APP_ENV !== 'development',
    maxAgeSeconds: maxAge,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
    maxAge: opts.maxAge,
  });
}

/** Best-effort clear the public session cookie (used on hard-invalid sessions). */
export async function clearSessionCookie(): Promise<void> {
  const opts = clearedSessionCookieOptions(publicEnv.APP_ENV !== 'development');
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, '', {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
    maxAge: opts.maxAge,
  });
}

/**
 * Read the session cookie (server-side only) and resume via SessionService.
 * Returns the CandidateActor + attempt on success. Any invalid/expired/
 * revoked state raises an AppError which routes convert to a safe JSON error.
 */
export async function requireCandidateActor(): Promise<{
  actor: CandidateActor;
  attempt: Awaited<ReturnType<typeof sessionService.resumeByToken>>['attempt'];
  session: Awaited<ReturnType<typeof sessionService.resumeByToken>>['session'];
}> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) throw new AppError('SESSION_NOT_FOUND');
  const env = getServerEnv();
  const resumed = await sessionService.resumeByToken(getDb(), env.SESSION_SECRET, raw);
  return {
    actor: {
      type: 'PUBLIC_CANDIDATE',
      sessionRef: resumed.session.publicRef,
      attemptId: resumed.attempt.id,
    },
    attempt: resumed.attempt,
    session: resumed.session,
  };
}

/**
 * Best-effort resume of the current browser session from its cookie. Returns
 * the attempt+session when a valid ACTIVE/COMPLETED session exists, or null for
 * any missing/invalid/expired/revoked state (never throws). Used by the
 * two-session routes to make "start" idempotent per session kind.
 */
export async function tryResumeSession(): Promise<{
  attempt: Awaited<ReturnType<typeof sessionService.resumeByToken>>['attempt'];
  session: Awaited<ReturnType<typeof sessionService.resumeByToken>>['session'];
} | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const env = getServerEnv();
    const { attempt, session } = await sessionService.resumeByToken(
      getDb(),
      env.SESSION_SECRET,
      raw,
    );
    return { attempt, session };
  } catch {
    return null;
  }
}

/**
 * Best-effort candidate-side audit (Data §40, §79–80; Tech §56). Records a
 * critical candidate event with a fresh correlation id. Wrapped so an audit
 * write hiccup can NEVER turn a candidate's successful action into a failure —
 * the candidate path must not depend on the audit trail's availability.
 */
export async function recordCandidateEvent(
  actor: CandidateActor,
  input: {
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    summary?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await auditService.record(getDb(), { correlationId: randomUUID(), actor }, input);
  } catch {
    // Intentionally swallowed — see doc comment.
  }
}

/** Apply a rate limit keyed by session/ip; throws RATE_LIMITED on breach. */
export async function checkRateLimit(op: RateLimitOperation, key: string): Promise<void> {
  const limiter = limiterFor(op);
  const result = await limiter.limit(key);
  if (!result.success) throw new AppError('RATE_LIMITED');
}
