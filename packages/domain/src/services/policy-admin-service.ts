import {
  getLatestPublishedPolicyVersion,
  listPolicyConfigurations,
  listPolicyVersionsByConfiguration,
  type Database,
  type PolicyVersion,
} from '@pcs/db';
import type { AdminActor } from '../authz';
import { assertAdmin } from './errors';
import { auditService } from './audit-service';
import type { MutationContext } from './content-admin-service';
import { policyService } from './policy-service';

/**
 * PolicyAdminService — the CMS surface for the versioned policy that governs
 * NEW sessions (Functional §90–91; Data §18–20). MVP manages a single "default"
 * policy configuration; each edit is a new DRAFT version and only takes effect
 * for new sessions once published (historical attempts keep their snapshot).
 */

const DEFAULT_CONFIG_NAME = 'default';

export interface PolicyView {
  id: string;
  versionNumber: number;
  status: string;
  sessionLifetimeSeconds: number;
  questionnaireTimeLimitSeconds: number | null;
  timerMode: string;
  allowResume: boolean;
  allowMultiDevice: boolean;
  retakeMode: string;
  maxAttempts: number;
  cooldownSeconds: number;
}

export interface PolicyState {
  configId: string | null;
  currentPublished: PolicyView | null;
  versions: PolicyView[];
}

export interface PolicyDraftFields {
  sessionLifetimeSeconds: number;
  questionnaireTimeLimitSeconds?: number | null;
  allowResume?: boolean;
  allowMultiDevice?: boolean;
  retakeMode?: string;
  maxAttempts?: number;
  cooldownSeconds?: number;
}

function toView(pv: PolicyVersion): PolicyView {
  return {
    id: pv.id,
    versionNumber: pv.versionNumber,
    status: pv.status,
    sessionLifetimeSeconds: pv.sessionLifetimeSeconds,
    questionnaireTimeLimitSeconds: pv.questionnaireTimeLimitSeconds,
    timerMode: pv.timerMode,
    allowResume: pv.allowResume,
    allowMultiDevice: pv.allowMultiDevice,
    retakeMode: pv.retakeMode,
    maxAttempts: pv.maxAttempts,
    cooldownSeconds: pv.cooldownSeconds,
  };
}

export const policyAdminService = {
  async getState(db: Database, actor: AdminActor): Promise<PolicyState> {
    assertAdmin(actor);
    const configs = await listPolicyConfigurations(db);
    const config = configs[0];
    if (!config) return { configId: null, currentPublished: null, versions: [] };
    const [versions, current] = await Promise.all([
      listPolicyVersionsByConfiguration(db, config.id),
      getLatestPublishedPolicyVersion(db, config.id),
    ]);
    return {
      configId: config.id,
      currentPublished: current ? toView(current) : null,
      versions: versions.map(toView),
    };
  },

  async saveDraft(
    db: Database,
    actor: AdminActor,
    input: PolicyDraftFields,
    ctx: MutationContext,
  ): Promise<PolicyView> {
    assertAdmin(actor);
    const configs = await listPolicyConfigurations(db);
    const config =
      configs[0] ??
      (await policyService.createConfiguration(db, actor, { name: DEFAULT_CONFIG_NAME }));
    const draft = await policyService.draft(db, actor, {
      policyConfigurationId: config.id,
      ...input,
    });
    await auditService.record(
      db,
      { correlationId: ctx.correlationId, actor },
      {
        action: 'policy.version.drafted',
        entityType: 'policy_version',
        entityId: draft.id,
        summary: `policy draft v${draft.versionNumber}`,
        metadata: { ...input },
      },
    );
    return toView(draft);
  },

  async publish(
    db: Database,
    actor: AdminActor,
    versionId: string,
    ctx: MutationContext,
  ): Promise<PolicyView> {
    assertAdmin(actor);
    const published = await policyService.publish(db, actor, versionId);
    await auditService.record(
      db,
      { correlationId: ctx.correlationId, actor },
      {
        action: 'policy.version.published',
        entityType: 'policy_version',
        entityId: published.id,
        summary: `policy v${published.versionNumber} published`,
      },
    );
    return toView(published);
  },
};
