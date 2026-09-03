import {
  casPublishPolicyVersion,
  createPolicyConfiguration,
  getLatestPublishedPolicyVersion,
  getPolicyVersion,
  insertDraftPolicyVersion,
  nextPolicyVersionNumber,
  type AttemptPolicySnapshot,
  type Database,
  type PolicyVersion,
} from '@pcs/db';
import { AppError } from '@pcs/security';
import type { Actor } from '../authz';
import { assertAdmin } from './errors';

/**
 * PolicyService — draft → validate → publish for policy versions
 * (Master Spec §24.4; Functional Spec §90–91; Data §18–20). Policy changes are
 * versioned and only affect NEW sessions; historical attempts snapshot their
 * policy so behavior cannot silently shift (Data §46, §91–94; INV-D07).
 */

export interface PolicyDraftInput {
  policyConfigurationId: string;
  sessionLifetimeSeconds: number;
  questionnaireTimeLimitSeconds?: number | null;
  allowResume?: boolean;
  allowMultiDevice?: boolean;
  retakeMode?: string;
  maxAttempts?: number;
  cooldownSeconds?: number;
}

const RETAKE_MODES = new Set([
  'NEVER',
  'ON_NEW_VERSION',
  'AFTER_COOLDOWN',
  'ADMIN_APPROVAL',
  'UNLIMITED',
]);

export function validatePolicyDraft(input: PolicyDraftInput): void {
  const posInt = (n: unknown, name: string) => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
      throw new AppError('VALIDATION_ERROR', `${name} must be a non-negative integer`);
    }
  };
  posInt(input.sessionLifetimeSeconds, 'sessionLifetimeSeconds');
  if (input.sessionLifetimeSeconds < 60) {
    throw new AppError('VALIDATION_ERROR', 'sessionLifetimeSeconds must be at least 60');
  }
  if (input.questionnaireTimeLimitSeconds != null) {
    posInt(input.questionnaireTimeLimitSeconds, 'questionnaireTimeLimitSeconds');
  }
  if (input.maxAttempts !== undefined) {
    if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1) {
      throw new AppError('VALIDATION_ERROR', 'maxAttempts must be a positive integer');
    }
  }
  if (input.cooldownSeconds !== undefined) posInt(input.cooldownSeconds, 'cooldownSeconds');
  if (input.retakeMode && !RETAKE_MODES.has(input.retakeMode)) {
    throw new AppError('VALIDATION_ERROR', `unknown retakeMode ${input.retakeMode}`);
  }
}

/** Snapshot policy values onto an attempt (Data §20, §46; INV-D07). */
export function snapshotPolicyVersion(pv: PolicyVersion): AttemptPolicySnapshot {
  if (pv.timerMode !== 'absolute') {
    throw new AppError('INTEGRITY_ERROR', `unsupported timerMode ${pv.timerMode}`);
  }
  return {
    policyVersionId: pv.id,
    sessionLifetimeSeconds: pv.sessionLifetimeSeconds,
    questionnaireTimeLimitSeconds: pv.questionnaireTimeLimitSeconds,
    timerMode: 'absolute',
    allowResume: pv.allowResume,
    allowMultiDevice: pv.allowMultiDevice,
    retakeMode: pv.retakeMode,
    maxAttempts: pv.maxAttempts,
    cooldownSeconds: pv.cooldownSeconds,
  };
}

export const policyService = {
  async createConfiguration(
    db: Database,
    actor: Actor,
    input: { name: string; policyType?: string },
  ) {
    assertAdmin(actor);
    return db.transaction(async (tx) => createPolicyConfiguration(tx, input));
  },

  async draft(db: Database, actor: Actor, input: PolicyDraftInput) {
    assertAdmin(actor);
    validatePolicyDraft(input);
    return db.transaction(async (tx) => {
      const versionNumber = await nextPolicyVersionNumber(tx, input.policyConfigurationId);
      return insertDraftPolicyVersion(tx, {
        policyConfigurationId: input.policyConfigurationId,
        versionNumber,
        sessionLifetimeSeconds: input.sessionLifetimeSeconds,
        questionnaireTimeLimitSeconds: input.questionnaireTimeLimitSeconds ?? undefined,
        allowResume: input.allowResume,
        allowMultiDevice: input.allowMultiDevice,
        retakeMode: input.retakeMode,
        maxAttempts: input.maxAttempts,
        cooldownSeconds: input.cooldownSeconds,
      });
    });
  },

  async publish(db: Database, actor: Actor, id: string) {
    assertAdmin(actor);
    const won = await db.transaction(async (tx) => {
      const current = await getPolicyVersion(tx, id);
      if (!current) throw new AppError('NOT_FOUND', 'policy version not found');
      if (current.status === 'PUBLISHED') throw new AppError('CONFLICT', 'already published');
      if (current.status !== 'DRAFT')
        throw new AppError('CONFLICT', `cannot publish ${current.status}`);
      return casPublishPolicyVersion(tx, id, actor.adminActorId);
    });
    if (!won) throw new AppError('CONFLICT', 'policy version changed under us');
    return (await getPolicyVersion(db, id))!;
  },

  /** Resolve the effective policy for a new session (Data §20, §93). */
  async resolveCurrent(db: Database, configId: string): Promise<PolicyVersion | null> {
    return getLatestPublishedPolicyVersion(db, configId);
  },
};
