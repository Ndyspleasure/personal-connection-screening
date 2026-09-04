import { insertAuditEvent, type AuditEventRecord } from '@pcs/db';
import type { DbExecutor } from '@pcs/db';
import type { Actor } from '../authz';

/**
 * AuditService — the single, append-only trail for every privileged action
 * (Data & State Model §40, §79–80; Security §48; Technology Architecture §56).
 * Callers pass a correlation id so all writes from one request group together.
 * The DB enforces append-only; this service only ever inserts.
 */

export interface AuditContext {
  correlationId: string;
  actor: Actor;
}

export interface AuditInput {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}

function actorFields(actor: Actor): { actorType: string; actorId: string | null } {
  if (actor.type === 'ADMIN') return { actorType: 'ADMIN', actorId: actor.adminActorId };
  return { actorType: 'PUBLIC_CANDIDATE', actorId: actor.attemptId };
}

export const auditService = {
  async record(db: DbExecutor, ctx: AuditContext, input: AuditInput): Promise<AuditEventRecord> {
    const { actorType, actorId } = actorFields(ctx.actor);
    return insertAuditEvent(db, {
      correlationId: ctx.correlationId,
      actorType,
      actorId,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      summary: input.summary ?? null,
      metadata: input.metadata,
    });
  },
};
