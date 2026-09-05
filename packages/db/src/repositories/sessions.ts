import { and, asc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { DbExecutor } from './authoring';
import { accessCode, sessionKind, type AccessCode, type SessionKind } from '../schema/sessions';

/**
 * Session-catalog + access-code data access (Two-Session phase).
 *
 * Session kinds are CMS config (mutable); access codes are operational state
 * whose critical mutation — consuming a use — is a concurrency-safe atomic
 * `UPDATE ... RETURNING` so a usage cap holds even under simultaneous requests
 * (Data §57–59, INV-C02; the same compare-and-swap discipline as attempt/session).
 */

// --- session_kind ------------------------------------------------------------

export async function listActiveSessionKinds(exec: DbExecutor): Promise<SessionKind[]> {
  return exec
    .select()
    .from(sessionKind)
    .where(eq(sessionKind.status, 'ACTIVE'))
    .orderBy(asc(sessionKind.displayOrder), asc(sessionKind.createdAt));
}

export async function listAllSessionKinds(exec: DbExecutor): Promise<SessionKind[]> {
  return exec
    .select()
    .from(sessionKind)
    .orderBy(asc(sessionKind.displayOrder), asc(sessionKind.createdAt));
}

export async function getSessionKindByKey(
  exec: DbExecutor,
  key: string,
): Promise<SessionKind | null> {
  const rows = await exec.select().from(sessionKind).where(eq(sessionKind.key, key)).limit(1);
  return rows[0] ?? null;
}

export async function getSessionKindById(
  exec: DbExecutor,
  id: string,
): Promise<SessionKind | null> {
  const rows = await exec.select().from(sessionKind).where(eq(sessionKind.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function insertSessionKind(
  exec: DbExecutor,
  input: {
    key: string;
    name: string;
    description?: string | null;
    tagline?: string | null;
    displayOrder?: number;
    requiresAccessCode?: boolean;
    questionnaireId: string;
    accent?: string | null;
    status?: string;
  },
): Promise<SessionKind> {
  const rows = await exec
    .insert(sessionKind)
    .values({
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      tagline: input.tagline ?? null,
      displayOrder: input.displayOrder ?? 0,
      requiresAccessCode: input.requiresAccessCode ?? false,
      questionnaireId: input.questionnaireId,
      accent: input.accent ?? null,
      status: input.status ?? 'ACTIVE',
    })
    .returning();
  return rows[0]!;
}

export async function updateSessionKind(
  exec: DbExecutor,
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    tagline: string | null;
    displayOrder: number;
    status: string;
  }>,
): Promise<SessionKind | null> {
  const rows = await exec
    .update(sessionKind)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(sessionKind.id, id))
    .returning();
  return rows[0] ?? null;
}

// --- access_code -------------------------------------------------------------

export async function insertAccessCode(
  exec: DbExecutor,
  input: {
    sessionKindId: string;
    codeHash: string;
    label?: string | null;
    expiresAt?: Date | null;
    maxUses?: number | null;
    createdBy?: string | null;
  },
): Promise<AccessCode> {
  const rows = await exec
    .insert(accessCode)
    .values({
      sessionKindId: input.sessionKindId,
      codeHash: input.codeHash,
      label: input.label ?? null,
      expiresAt: input.expiresAt ?? null,
      maxUses: input.maxUses ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return rows[0]!;
}

export async function getAccessCodeById(exec: DbExecutor, id: string): Promise<AccessCode | null> {
  const rows = await exec.select().from(accessCode).where(eq(accessCode.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Look up a code by kind + hash — used only to classify a failed consume. */
export async function getAccessCodeByKindAndHash(
  exec: DbExecutor,
  input: { sessionKindId: string; codeHash: string },
): Promise<AccessCode | null> {
  const rows = await exec
    .select()
    .from(accessCode)
    .where(
      and(
        eq(accessCode.sessionKindId, input.sessionKindId),
        eq(accessCode.codeHash, input.codeHash),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface AccessCodeAdminRow extends AccessCode {
  sessionKindKey: string | null;
  sessionKindName: string | null;
}

export async function listAccessCodes(
  exec: DbExecutor,
  sessionKindId?: string,
): Promise<AccessCodeAdminRow[]> {
  const base = exec
    .select({
      id: accessCode.id,
      sessionKindId: accessCode.sessionKindId,
      codeHash: accessCode.codeHash,
      label: accessCode.label,
      status: accessCode.status,
      expiresAt: accessCode.expiresAt,
      maxUses: accessCode.maxUses,
      useCount: accessCode.useCount,
      lastUsedAt: accessCode.lastUsedAt,
      createdBy: accessCode.createdBy,
      createdAt: accessCode.createdAt,
      updatedAt: accessCode.updatedAt,
      sessionKindKey: sessionKind.key,
      sessionKindName: sessionKind.name,
    })
    .from(accessCode)
    .leftJoin(sessionKind, eq(sessionKind.id, accessCode.sessionKindId))
    .orderBy(sql`${accessCode.createdAt} desc`);
  const rows = sessionKindId
    ? await base.where(eq(accessCode.sessionKindId, sessionKindId))
    : await base;
  return rows as AccessCodeAdminRow[];
}

export async function updateAccessCode(
  exec: DbExecutor,
  id: string,
  patch: Partial<{
    label: string | null;
    status: string;
    expiresAt: Date | null;
    maxUses: number | null;
  }>,
): Promise<AccessCode | null> {
  const rows = await exec
    .update(accessCode)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(accessCode.id, id))
    .returning();
  return rows[0] ?? null;
}

/**
 * Atomically consume one use of a code. The WHERE re-checks status + expiry +
 * usage cap at UPDATE time, so under READ COMMITTED two concurrent consumes of a
 * single-use code cannot both succeed: Postgres serializes the row writes and the
 * loser re-evaluates the predicate against the winner's committed row → 0 rows.
 * Returns the updated row on success, or null if the code is missing/ineligible.
 */
export async function consumeAccessCode(
  exec: DbExecutor,
  input: { sessionKindId: string; codeHash: string; now?: Date },
): Promise<AccessCode | null> {
  const now = input.now ?? new Date();
  const rows = await exec
    .update(accessCode)
    .set({
      useCount: sql`${accessCode.useCount} + 1`,
      lastUsedAt: now,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(accessCode.sessionKindId, input.sessionKindId),
        eq(accessCode.codeHash, input.codeHash),
        eq(accessCode.status, 'ACTIVE'),
        or(isNull(accessCode.expiresAt), gt(accessCode.expiresAt, now)),
        or(isNull(accessCode.maxUses), lt(accessCode.useCount, accessCode.maxUses)),
      ),
    )
    .returning();
  return rows[0] ?? null;
}
