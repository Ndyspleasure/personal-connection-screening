import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, getDb, type Database } from '@pcs/db';
import type { AdminActor, CandidateActor } from '../../authz';
import { policyAdminService } from '../policy-admin-service';
import { MIGRATIONS_DIR, recreateDatabase, withDatabase } from './hermetic-db';

/**
 * Policy manager integration tests (Phase 5 chunk 3). Hermetic DB because
 * getState enumerates policy configurations globally.
 */
const BASE_DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/pcs';
const HERMETIC_DB = process.env.POLICY_IT_DB ?? 'pcs_policy_it';
process.env.DATABASE_URL = withDatabase(BASE_DB_URL, HERMETIC_DB);
const hasDb = process.env.SKIP_ADMIN_IT !== '1';

const admin: AdminActor = { type: 'ADMIN', adminActorId: 'it-admin', role: 'OWNER' };
const notAdmin: CandidateActor = {
  type: 'PUBLIC_CANDIDATE',
  sessionRef: 'ses_x',
  attemptId: '00000000-0000-0000-0000-000000000000',
};
let db: Database;
const cid = () => crypto.randomUUID();

describe.runIf(hasDb)('policy manager (integration)', () => {
  beforeAll(async () => {
    await recreateDatabase(BASE_DB_URL, HERMETIC_DB);
    db = getDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  });
  afterAll(async () => {
    await closeDb();
  });

  it('rejects a non-admin', async () => {
    await expect(
      // @ts-expect-error candidate where admin required
      policyAdminService.getState(db, notAdmin),
    ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  });

  it('starts empty, then draft + publish makes a policy live for new sessions', async () => {
    const empty = await policyAdminService.getState(db, admin);
    expect(empty.configId).toBeNull();
    expect(empty.currentPublished).toBeNull();

    const draft = await policyAdminService.saveDraft(
      db,
      admin,
      {
        sessionLifetimeSeconds: 3600,
        questionnaireTimeLimitSeconds: 900,
        retakeMode: 'ON_NEW_VERSION',
        maxAttempts: 3,
        cooldownSeconds: 0,
      },
      { correlationId: cid() },
    );
    expect(draft.status).toBe('DRAFT');
    expect(draft.timerMode).toBe('absolute');

    // Not live until published.
    const beforePublish = await policyAdminService.getState(db, admin);
    expect(beforePublish.currentPublished).toBeNull();
    expect(beforePublish.configId).not.toBeNull();

    const published = await policyAdminService.publish(db, admin, draft.id, {
      correlationId: cid(),
    });
    expect(published.status).toBe('PUBLISHED');

    const live = await policyAdminService.getState(db, admin);
    expect(live.currentPublished?.id).toBe(published.id);
    expect(live.currentPublished?.sessionLifetimeSeconds).toBe(3600);
  });

  it('a second published version supersedes the first (highest version wins)', async () => {
    const v2 = await policyAdminService.saveDraft(
      db,
      admin,
      { sessionLifetimeSeconds: 7200 },
      { correlationId: cid() },
    );
    await policyAdminService.publish(db, admin, v2.id, { correlationId: cid() });
    const state = await policyAdminService.getState(db, admin);
    expect(state.currentPublished?.id).toBe(v2.id);
    expect(state.currentPublished?.sessionLifetimeSeconds).toBe(7200);
  });

  it('validates the draft (lifetime must be at least 60s)', async () => {
    await expect(
      policyAdminService.saveDraft(
        db,
        admin,
        { sessionLifetimeSeconds: 5 },
        { correlationId: cid() },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
