import { listAuditEvents, listRecentSessions, listRecentSubmissions, type Database } from '@pcs/db';
import type { AdminActor } from '../authz';
import { assertAdmin } from './errors';
import { auditService } from './audit-service';
import type { MutationContext } from './content-admin-service';
import { sessionService } from './session-service';

/**
 * AdminMonitorService — the read-only operational surface plus session revoke
 * (Functional §92–93, §95, §97). Owner-guarded. Submissions/sessions are
 * projections; revoke is the confirmed P0 security control (Threat TH-004;
 * confirmed decision D-8), and every revoke is audited.
 */

export interface SubmissionRow {
  submissionRef: string;
  resultRef: string | null;
  resultType: string | null;
  verificationRef: string | null;
  verificationStatus: string | null;
  questionnaireLabel: string;
  submittedAt: string | null;
}

export interface SessionRow {
  sessionRef: string;
  sessionStatus: string;
  attemptRef: string;
  attemptStatus: string;
  createdAt: string | null;
  expiresAt: string | null;
}

export interface AuditRow {
  id: string;
  createdAt: string | null;
  action: string;
  actorType: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
}

export const adminMonitorService = {
  async listSubmissions(db: Database, actor: AdminActor, limit = 100): Promise<SubmissionRow[]> {
    assertAdmin(actor);
    const rows = await listRecentSubmissions(db, limit);
    return rows.map((r) => ({
      submissionRef: r.submissionRef,
      resultRef: r.resultRef,
      resultType: r.resultType,
      verificationRef: r.verificationRef,
      verificationStatus: r.verificationStatus,
      questionnaireLabel: `${r.questionnaireSlug} v${r.questionnaireVersionNumber}`,
      submittedAt: r.submittedAt?.toISOString() ?? null,
    }));
  },

  async listSessions(db: Database, actor: AdminActor, limit = 100): Promise<SessionRow[]> {
    assertAdmin(actor);
    const rows = await listRecentSessions(db, limit);
    return rows.map((r) => ({
      sessionRef: r.sessionRef,
      sessionStatus: r.sessionStatus,
      attemptRef: r.attemptRef,
      attemptStatus: r.attemptStatus,
      createdAt: r.createdAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
    }));
  },

  async listAudit(db: Database, actor: AdminActor, limit = 100): Promise<AuditRow[]> {
    assertAdmin(actor);
    const rows = await listAuditEvents(db, { limit });
    return rows.map((e) => ({
      id: e.id,
      createdAt: e.createdAt?.toISOString() ?? null,
      action: e.action,
      actorType: e.actorType,
      actorId: e.actorId,
      entityType: e.entityType,
      entityId: e.entityId,
      summary: e.summary,
    }));
  },

  async revokeSession(
    db: Database,
    actor: AdminActor,
    sessionRef: string,
    ctx: MutationContext,
  ): Promise<void> {
    assertAdmin(actor);
    await sessionService.revoke(db, sessionRef);
    await auditService.record(
      db,
      { correlationId: ctx.correlationId, actor },
      {
        action: 'session.revoked',
        entityType: 'session',
        entityId: sessionRef,
        summary: `session ${sessionRef} revoked by owner`,
      },
    );
  },
};
