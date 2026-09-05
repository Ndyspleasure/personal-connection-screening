import {
  findCompletedAttemptsWithoutResult,
  findDuplicateFinalSubmissions,
  findFailAtOrAbovePassing,
  findPassBelowPassing,
  findResultScoreMismatch,
  findResultsWithoutVerification,
  findVersionMismatches,
  insertAuditEvent,
  insertIntegrityFindings,
  listIntegrityFindings,
  type Database,
  type IntegrityFindingInput,
  type IntegrityFindingRecord,
} from '@pcs/db';
import type { AdminActor } from '../authz';
import { assertAdmin } from './errors';

/**
 * IntegrityService — detects impossible/inconsistent states and RECORDS them;
 * it never silently repairs (Data §113; Sec §41; INV INT-02). Runs from two
 * authorized entry points: an owner on demand, and the scheduled cron
 * (CRON_SECRET). Authorization is enforced by the caller (the route), so
 * `runScan` accepts an explicit attribution rather than an actor.
 */

export interface ScanAttribution {
  correlationId: string;
  actorType: 'ADMIN' | 'SYSTEM';
  actorId: string | null;
}

export interface ScanSummary {
  scanId: string;
  findingCount: number;
  byKind: Record<string, number>;
}

export interface IntegrityFindingView {
  id: string;
  scanId: string | null;
  kind: string;
  severity: string;
  entityType: string | null;
  entityId: string | null;
  detail: unknown;
  detectedAt: string | null;
}

function toView(f: IntegrityFindingRecord): IntegrityFindingView {
  return {
    id: f.id,
    scanId: f.scanId,
    kind: f.kind,
    severity: f.severity,
    entityType: f.entityType,
    entityId: f.entityId,
    detail: f.detail,
    detectedAt: f.detectedAt?.toISOString() ?? null,
  };
}

export const integrityService = {
  /**
   * Run every detector, record any findings under one scanId, and audit the
   * scan. Returns a summary. Authorization is the caller's responsibility.
   */
  async runScan(db: Database, attribution: ScanAttribution): Promise<ScanSummary> {
    const scanId = crypto.randomUUID();
    const findings: IntegrityFindingInput[] = [];

    for (const r of await findPassBelowPassing(db)) {
      findings.push({
        scanId,
        kind: 'PASS_BELOW_PASSING',
        entityType: 'result',
        entityId: r.resultId,
        detail: { resultRef: r.resultRef, score: r.score, passingScore: r.passingScore },
      });
    }
    for (const r of await findFailAtOrAbovePassing(db)) {
      findings.push({
        scanId,
        kind: 'FAIL_AT_OR_ABOVE_PASSING',
        entityType: 'result',
        entityId: r.resultId,
        detail: { resultRef: r.resultRef, score: r.score, passingScore: r.passingScore },
      });
    }
    for (const r of await findResultScoreMismatch(db)) {
      findings.push({
        scanId,
        kind: 'RESULT_SCORE_MISMATCH',
        entityType: 'result',
        entityId: r.resultId,
        detail: {
          resultRef: r.resultRef,
          resultScore: r.resultScore,
          evaluationScore: r.evaluationScore,
        },
      });
    }
    for (const r of await findResultsWithoutVerification(db)) {
      findings.push({
        scanId,
        kind: 'RESULT_WITHOUT_VERIFICATION',
        entityType: 'result',
        entityId: r.resultId,
        detail: { resultRef: r.resultRef },
      });
    }
    for (const r of await findDuplicateFinalSubmissions(db)) {
      findings.push({
        scanId,
        kind: 'DUPLICATE_FINAL_SUBMISSION',
        entityType: 'attempt',
        entityId: r.attemptId,
        detail: { completedCount: r.count },
      });
    }
    for (const r of await findVersionMismatches(db)) {
      findings.push({
        scanId,
        kind: 'VERSION_MISMATCH',
        entityType: 'evaluation',
        entityId: r.evaluationId,
        detail: {
          evaluationQuestionnaireVersionId: r.evaluationQuestionnaireVersionId,
          attemptQuestionnaireVersionId: r.attemptQuestionnaireVersionId,
        },
      });
    }
    for (const r of await findCompletedAttemptsWithoutResult(db)) {
      findings.push({
        scanId,
        kind: 'COMPLETED_ATTEMPT_WITHOUT_RESULT',
        entityType: 'attempt',
        entityId: r.attemptId,
        detail: { attemptRef: r.attemptRef },
      });
    }

    await insertIntegrityFindings(db, findings);

    const byKind: Record<string, number> = {};
    for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;

    await insertAuditEvent(db, {
      correlationId: attribution.correlationId,
      actorType: attribution.actorType,
      actorId: attribution.actorId,
      action: 'integrity.scan.completed',
      entityType: 'integrity_scan',
      entityId: scanId,
      summary: `integrity scan recorded ${findings.length} finding(s)`,
      metadata: { findingCount: findings.length, byKind },
    });

    return { scanId, findingCount: findings.length, byKind };
  },

  async listFindings(
    db: Database,
    actor: AdminActor,
    limit = 100,
  ): Promise<IntegrityFindingView[]> {
    assertAdmin(actor);
    const rows = await listIntegrityFindings(db, { limit });
    return rows.map(toView);
  },
};
