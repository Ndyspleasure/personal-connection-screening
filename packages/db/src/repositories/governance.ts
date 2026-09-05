import { desc, eq, sql } from 'drizzle-orm';
import {
  adminActor,
  auditEvent,
  type AdminActorRecord,
  type AuditEventRecord,
} from '../schema/governance';
import type { DbExecutor } from './authoring';

/**
 * Governance repositories (Data & State Model §40–44). Pure persistence — all
 * authorization and audit-composition lives in the domain services.
 */

export async function getAdminActorBySubject(
  db: DbExecutor,
  subject: string,
): Promise<AdminActorRecord | null> {
  const rows = await db.select().from(adminActor).where(eq(adminActor.subject, subject)).limit(1);
  return rows[0] ?? null;
}

export async function getAdminActorByEmail(
  db: DbExecutor,
  email: string,
): Promise<AdminActorRecord | null> {
  const rows = await db.select().from(adminActor).where(eq(adminActor.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function countAdminActors(db: DbExecutor): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(adminActor);
  return Number(row?.n ?? 0);
}

export async function insertAdminActor(
  db: DbExecutor,
  input: { subject?: string | null; email: string; role?: string },
): Promise<AdminActorRecord> {
  const [row] = await db
    .insert(adminActor)
    .values({ subject: input.subject ?? null, email: input.email, role: input.role ?? 'OWNER' })
    .returning();
  return row!;
}

/** Bind a Supabase subject to a pre-provisioned (email-only) actor on first sign-in. */
export async function linkAdminActorSubject(
  db: DbExecutor,
  id: string,
  subject: string,
): Promise<AdminActorRecord> {
  const [row] = await db
    .update(adminActor)
    .set({ subject, updatedAt: sql`now()` })
    .where(eq(adminActor.id, id))
    .returning();
  return row!;
}

export interface AuditEventInput {
  correlationId: string;
  actorType: string;
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}

export async function insertAuditEvent(
  db: DbExecutor,
  input: AuditEventInput,
): Promise<AuditEventRecord> {
  const [row] = await db
    .insert(auditEvent)
    .values({
      correlationId: input.correlationId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      summary: input.summary ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();
  return row!;
}

export async function listAuditEvents(
  db: DbExecutor,
  opts: { limit?: number; offset?: number } = {},
): Promise<AuditEventRecord[]> {
  return db
    .select()
    .from(auditEvent)
    .orderBy(desc(auditEvent.createdAt))
    .limit(Math.min(opts.limit ?? 100, 500))
    .offset(opts.offset ?? 0);
}
