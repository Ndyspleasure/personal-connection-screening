import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbExecutor } from './authoring';
import {
  attempt,
  candidateContext,
  session,
  type AttemptPolicySnapshot,
} from '../schema/execution';

/**
 * Execution-domain data access (Data & State Model §21–32, §81).
 *
 * These helpers accept either a base connection or a transaction so a service
 * can atomically create attempt + session under one boundary (Data §81), and
 * so subsequent expire/revoke/complete transitions are guarded end-to-end.
 * Concurrency-critical writes are compare-and-swap on `status` so a stale
 * request never silently overwrites current state (Data §57–59, INV-C02).
 */

// --- candidate context -------------------------------------------------------

export async function insertCandidateContext(
  exec: DbExecutor,
  input: { publicRef: string; name?: string | null; contact?: string | null },
) {
  const rows = await exec
    .insert(candidateContext)
    .values({
      publicRef: input.publicRef,
      name: input.name ?? null,
      contact: input.contact ?? null,
    })
    .returning();
  return rows[0]!;
}

// --- attempt -----------------------------------------------------------------

export async function insertAttempt(
  exec: DbExecutor,
  input: {
    publicRef: string;
    candidateContextId?: string | null;
    questionnaireVersionId: string;
    scoringVersionId: string;
    policyVersionId: string;
    policySnapshot: AttemptPolicySnapshot;
    questionnaireDeadline?: Date | null;
    status?: string;
  },
) {
  const rows = await exec
    .insert(attempt)
    .values({
      publicRef: input.publicRef,
      candidateContextId: input.candidateContextId ?? null,
      questionnaireVersionId: input.questionnaireVersionId,
      scoringVersionId: input.scoringVersionId,
      policyVersionId: input.policyVersionId,
      policySnapshot: input.policySnapshot,
      questionnaireDeadline: input.questionnaireDeadline ?? null,
      questionnaireStartedAt: input.questionnaireDeadline ? sql`now()` : null,
      status: input.status ?? 'ACTIVE',
    })
    .returning();
  return rows[0]!;
}

export async function getAttemptById(exec: DbExecutor, id: string, forUpdate = false) {
  const q = exec.select().from(attempt).where(eq(attempt.id, id)).limit(1);
  const rows = await (forUpdate ? q.for('update') : q);
  return rows[0] ?? null;
}

export async function getAttemptByRef(exec: DbExecutor, publicRef: string) {
  const rows = await exec.select().from(attempt).where(eq(attempt.publicRef, publicRef)).limit(1);
  return rows[0] ?? null;
}

export async function casTransitionAttempt(
  exec: DbExecutor,
  input: { id: string; from: string[]; to: string; completedAt?: Date | null },
): Promise<boolean> {
  const rows = await exec
    .update(attempt)
    .set({
      status: input.to,
      completedAt: input.completedAt ?? null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(attempt.id, input.id), inArray(attempt.status, input.from)))
    .returning({ id: attempt.id });
  return rows.length > 0;
}

// --- session -----------------------------------------------------------------

export async function insertSession(
  exec: DbExecutor,
  input: {
    publicRef: string;
    attemptId: string;
    tokenFingerprint: string;
    expiresAt: Date;
  },
) {
  const rows = await exec
    .insert(session)
    .values({
      publicRef: input.publicRef,
      attemptId: input.attemptId,
      tokenFingerprint: input.tokenFingerprint,
      expiresAt: input.expiresAt,
      status: 'ACTIVE',
    })
    .returning();
  return rows[0]!;
}

export async function getSessionByFingerprint(exec: DbExecutor, tokenFingerprint: string) {
  const rows = await exec
    .select()
    .from(session)
    .where(eq(session.tokenFingerprint, tokenFingerprint))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSessionByRef(exec: DbExecutor, publicRef: string) {
  const rows = await exec.select().from(session).where(eq(session.publicRef, publicRef)).limit(1);
  return rows[0] ?? null;
}

export async function touchSession(exec: DbExecutor, id: string): Promise<void> {
  await exec
    .update(session)
    .set({ lastSeenAt: sql`now()` })
    .where(eq(session.id, id));
}

export async function casTransitionSession(
  exec: DbExecutor,
  input: { id: string; from: string[]; to: string; revokedAt?: Date | null },
): Promise<boolean> {
  const rows = await exec
    .update(session)
    .set({
      status: input.to,
      revokedAt: input.revokedAt ?? null,
    })
    .where(and(eq(session.id, input.id), inArray(session.status, input.from)))
    .returning({ id: session.id });
  return rows.length > 0;
}
