import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  closeDb,
  getDb,
  getPolicyVersion,
  getQuestionnaireVersion,
  getScoringVersion,
  getSessionByRef,
  schema,
  sql,
  type Database,
} from '@pcs/db';
import type { AdminActor, CandidateActor } from '../../authz';
import { adminMonitorService } from '../admin-monitor-service';
import { answerService } from '../answer-service';
import { policyAdminService } from '../policy-admin-service';
import { questionnaireAdminService } from '../questionnaire-admin-service';
import { sessionService } from '../session-service';
import { submissionService } from '../submission-service';
import { MIGRATIONS_DIR, recreateDatabase, withDatabase } from './hermetic-db';

/**
 * Admin monitor + session revoke integration tests (Phase 5 chunk 4). Hermetic
 * DB: drives a full candidate flow to COMPLETED so the monitor has real rows.
 */
const BASE_DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/pcs';
const HERMETIC_DB = process.env.MONITOR_IT_DB ?? 'pcs_monitor_it';
process.env.DATABASE_URL = withDatabase(BASE_DB_URL, HERMETIC_DB);
const hasDb = process.env.SKIP_ADMIN_IT !== '1';

const admin: AdminActor = { type: 'ADMIN', adminActorId: 'it-admin', role: 'OWNER' };
const notAdmin: CandidateActor = {
  type: 'PUBLIC_CANDIDATE',
  sessionRef: 'ses_x',
  attemptId: '00000000-0000-0000-0000-000000000000',
};
const TOKEN_SECRET = 'monitor-it-token-secret';
let db: Database;
const cid = () => crypto.randomUUID();

/** Publish a scored questionnaire + a policy, and return the trio start() needs. */
async function seedPublishedTrio(slug: string) {
  const { draftVersion } = await questionnaireAdminService.createQuestionnaire(
    db,
    admin,
    { slug, name: slug },
    { correlationId: cid() },
  );
  const q1 = await questionnaireAdminService.addQuestion(
    db,
    admin,
    draftVersion.id,
    {
      type: 'boolean',
      text: 'Q1?',
      required: true,
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
    { correlationId: cid() },
  );
  await questionnaireAdminService.publishWithScoring(
    db,
    admin,
    draftVersion.id,
    { passingScore: 10, rules: [{ optionVersionId: q1.optionVersionIds[0]!, points: 40 }] },
    { correlationId: cid() },
  );
  const questionnaireVersion = (await getQuestionnaireVersion(db, draftVersion.id))!;
  const scoringVersion = (await getScoringVersion(db, questionnaireVersion.scoringVersionId!))!;

  const draftPolicy = await policyAdminService.saveDraft(
    db,
    admin,
    { sessionLifetimeSeconds: 3600, questionnaireTimeLimitSeconds: 900 },
    { correlationId: cid() },
  );
  const publishedPolicy = await policyAdminService.publish(db, admin, draftPolicy.id, {
    correlationId: cid(),
  });
  const policyVersion = (await getPolicyVersion(db, publishedPolicy.id))!;

  return { questionnaireVersion, scoringVersion, policyVersion, q1 };
}

describe.runIf(hasDb)('admin monitor + revoke (integration)', () => {
  beforeAll(async () => {
    await recreateDatabase(BASE_DB_URL, HERMETIC_DB);
    db = getDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  });
  afterAll(async () => {
    await closeDb();
  });

  it('rejects a non-admin on every method', async () => {
    // @ts-expect-error candidate where admin required
    await expect(adminMonitorService.listSubmissions(db, notAdmin)).rejects.toMatchObject({
      code: 'NOT_AUTHORIZED',
    });
    await expect(
      // @ts-expect-error candidate where admin required
      adminMonitorService.revokeSession(db, notAdmin, 'ses_x', { correlationId: cid() }),
    ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  });

  it('surfaces a completed submission in the monitor', async () => {
    const trio = await seedPublishedTrio('mon-a');
    const started = await sessionService.start(db, TOKEN_SECRET, trio);
    const actor: CandidateActor = {
      type: 'PUBLIC_CANDIDATE',
      sessionRef: started.session.publicRef,
      attemptId: started.attempt.id,
    };
    await answerService.save(db, actor, {
      questionVersionId: trio.q1.questionVersionId,
      expectedRevision: null,
      selectedOptionVersionIds: [trio.q1.optionVersionIds[0]!],
    });
    const finalized = await submissionService.finalize(db, actor);
    expect(finalized.result.resultType).toBe('PASS');

    const subs = await adminMonitorService.listSubmissions(db, admin);
    const row = subs.find((s) => s.submissionRef === finalized.submission.publicRef)!;
    expect(row.resultType).toBe('PASS');
    expect(row.questionnaireLabel).toContain('mon-a');
    expect(row.verificationStatus).toBe('VALID');
  });

  it('revokes an ACTIVE session (session + attempt REVOKED) and audits it', async () => {
    const trio = await seedPublishedTrio('mon-b');
    const started = await sessionService.start(db, TOKEN_SECRET, trio);

    // It shows up as an active session before revoke.
    const before = await adminMonitorService.listSessions(db, admin);
    expect(before.find((s) => s.sessionRef === started.session.publicRef)?.sessionStatus).toBe(
      'ACTIVE',
    );

    await adminMonitorService.revokeSession(db, admin, started.session.publicRef, {
      correlationId: cid(),
    });

    const session = (await getSessionByRef(db, started.session.publicRef))!;
    expect(session.status).toBe('REVOKED');
    const [attempt] = await db
      .select()
      .from(schema.attempt)
      .where(sql`id = ${started.attempt.id}`);
    expect(attempt!.status).toBe('REVOKED');

    const audit = await adminMonitorService.listAudit(db, admin);
    expect(audit.some((e) => e.action === 'session.revoked')).toBe(true);
  });

  it('a revoked session can no longer submit', async () => {
    const trio = await seedPublishedTrio('mon-c');
    const started = await sessionService.start(db, TOKEN_SECRET, trio);
    const actor: CandidateActor = {
      type: 'PUBLIC_CANDIDATE',
      sessionRef: started.session.publicRef,
      attemptId: started.attempt.id,
    };
    await adminMonitorService.revokeSession(db, admin, started.session.publicRef, {
      correlationId: cid(),
    });
    await expect(submissionService.finalize(db, actor)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  });
});
