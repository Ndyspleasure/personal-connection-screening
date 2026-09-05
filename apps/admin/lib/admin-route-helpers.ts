import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServerEnv } from '@pcs/config/server';
import { getDb, type Database } from '@pcs/db';
import { adminAuthService, type AdminActor } from '@pcs/domain';
import { AppError, isRequestOriginValid, logServerError, toPublicError } from '@pcs/security';
import { safeParse } from '@pcs/validation';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/config';

/**
 * Admin API route helpers (Technology Architecture §22–23, §71–74). Every
 * privileged route funnels through these so authentication (Supabase),
 * authorization (admin_actor allow-list), Origin/CSRF, payload parsing, and
 * safe error mapping live in one enforceable place — the handler stays thin.
 */

type ParseableSchema<T> = {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
};

export function db(): Database {
  return getDb();
}

/** One correlation id per request, threaded into every audit write (Tech §56). */
export function newCorrelationId(): string {
  return randomUUID();
}

export function toErrorResponse(err: unknown): NextResponse {
  const pub = toPublicError(err);
  if (pub.status >= 500) logServerError(err, { correlationId: randomUUID(), app: 'admin' });
  return NextResponse.json(pub.body, { status: pub.status });
}

/** Enforce Origin on state-changing admin requests (Threat TH-049). */
export function ensureAdminOriginAllowed(req: NextRequest): void {
  const env = getServerEnv();
  if (
    !isRequestOriginValid({
      method: req.method,
      origin: req.headers.get('origin'),
      allowedOrigins: env.ADMIN_ALLOWED_ORIGINS,
    })
  ) {
    throw new AppError('NOT_AUTHORIZED', 'origin not allowed');
  }
}

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
  const parsed = safeParse(schema as unknown as Parameters<typeof safeParse<T>>[0], body);
  if (!parsed.ok) throw new AppError('VALIDATION_ERROR', parsed.issues.join('; '));
  return parsed.data;
}

/**
 * Resolve the signed-in Supabase user into an authorized OWNER actor. Fails
 * closed with NOT_AUTHORIZED when the app is unconfigured, no user is present,
 * or the identity is not on the admin allow-list.
 */
export async function requireAdminActor(): Promise<AdminActor> {
  if (!isSupabaseConfigured()) throw new AppError('NOT_AUTHORIZED');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email) throw new AppError('NOT_AUTHORIZED');
  const env = getServerEnv();
  return adminAuthService.resolveActor(
    getDb(),
    { subject: user.id, email: user.email },
    env.ADMIN_BOOTSTRAP_EMAIL,
  );
}
