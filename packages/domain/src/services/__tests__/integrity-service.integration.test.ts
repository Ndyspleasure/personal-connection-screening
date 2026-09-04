import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  closeDb,
  getDb,
  getPolicyVersion,
  getQuestionnaireVersion,
  getScoringVersion,
  schema,
  sql,
  type Database,
} from '@pcs/db';
import type { AdminActor, CandidateActor } from '../../authz';
import { answerService } from '../answer-service';
import { integrityService } from '../integrity-service';
import { policyAdminService } from '../policy-admin-service';
import { questionnaireAdminService } from '../questionnaire-admin-service';
import { sessionService } from '../session-service';
import { submissionService } from '../submission-service';
import { MIGRATIONS_DIR, recreateDatabase, withDatabase } from './hermetic-db';

/**
 * IntegrityService integration tests (Phase 6 chunk 1). Hermetic DB: a clean
 * completed flow must produce ZERO findings; a deliberately-injected impossible
 * state must be DETECTED (and never repaired).
 */
const BASE_DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/pcs';
const HERMETIC_DB = process.env.INTEGRITY_IT_DB ?? 'pcs_integrity_it';
process.env.DATABASE_URL = withDatabase(BASE_DB_URL, HERMETIC_DB);
const hasDb = process.env.SKIP_ADMIN_IT !== '1';

const admin: AdminActor = { type: 'ADMIN', adminActorId: 'it-admin', role: 'OWNER' };
const notAdmin: CandidateActor = {
  type: 'PUBLIC_CANDIDATE',
  sessionRef: 'ses_x',
  attemptId: '00000000-0000-0000-0000-000000000000',
};
const TOKEN_SECRET = 'integrity-it-secret';
let db: Database;
const cid = () => crypto.randomUUID();
const sys = () => ({ correlationId: cid(), actorType: 'SYSTEM' as const, actorId: null });

async function seedTrio(slug: string) {
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
    { sessionLifetimeSeconds: 3600 },
    { correlationId: cid() },
  );
  const publishedPolicy = await policyAdminService.publish(db, admin, draftPolicy.id, {
    correlationId: cid(),
  });
  const policyVersion = (await getPolicyVersion(db, publishedPolicy.id))!;
  return { questionnaireVersion, scoringVersion, policyVersion, q1 };
}

describe.runIf(hasDb)('IntegrityService (integration)', () => {
  beforeAll(async () => {
    await recreateDatabase(BASE_DB_URL, HERMETIC_DB);
    db = getDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  });
  afterAll(async () => {
    await closeDb();
  });

  it('a clean completed flow produces zero findings', async () => {
    const trio = await seedTrio('int-clean');
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
    await submissionService.finalize(db, actor);

    const summary = await integrityService.runScan(db, sys());
    expect(summary.findingCount).toBe(0);
  });

  it('detects an injected PASS-below-passing + orphan result (records, never repairs)', async () => {
    const trio = await seedTrio('int-bad');
    const suffix = Math.random().toString(36).slice(2, 8);
    // Inject an impossible state directly (INSERT is allowed; the immutability
    // triggers only block UPDATE/DELETE). PASS with score 10 < passing 70, and
    // no verification row.
    const [att] = await db
      .insert(schema.attempt)
      .values({
        publicRef: `att-bad-${suffix}`,
        questionnaireVersionId: trio.questionnaireVersion.id,
        scoringVersionId: trio.scoringVersion.id,
        policyVersionId: trio.policyVersion.id,
        policySnapshot: {},
        status: 'COMPLETED',
        completedAt: sql`now()`,
      })
      .returning();
    const [sub] = await db
      .insert(schema.submission)
      .values({
        publicRef: `sub-bad-${suffix}`,
        attemptId: att!.id,
        status: 'COMPLETED',
        finalizedAt: sql`now()`,
      })
      .returning();
    const [ev] = await db
      .insert(schema.evaluation)
      .values({
        submissionId: sub!.id,
        questionnaireVersionId: trio.questionnaireVersion.id,
        scoringVersionId: trio.scoringVersion.id,
        score: 10,
        passingScore: 70,
        inputSnapshot: {},
        status: 'COMPLETED',
      })
      .returning();
    const [res] = await db
      .insert(schema.result)
      .values({
        publicRef: `res-bad-${suffix}`,
        submissionId: sub!.id,
        evaluationId: ev!.id,
        resultType: 'PASS',
        score: 10,
      })
      .returning();

    const summary = await integrityService.runScan(db, sys());
    expect(summary.byKind['PASS_BELOW_PASSING']).toBeGreaterThanOrEqual(1);
    expect(summary.byKind['RESULT_WITHOUT_VERIFICATION']).toBeGreaterThanOrEqual(1);

    const findings = await integrityService.listFindings(db, admin);
    const passBelow = findings.find(
      (f) => f.kind === 'PASS_BELOW_PASSING' && f.entityId === res!.id,
    );
    expect(passBelow).toBeTruthy();

    // Findings are never repaired: the impossible result row still stands.
    const [stillThere] = await db
      .select()
      .from(schema.result)
      .where(sql`id = ${res!.id}`);
    expect(stillThere!.resultType).toBe('PASS');
  });

  it('listFindings rejects a non-admin', async () => {
    await expect(
      // @ts-expect-error candidate where admin required
      integrityService.listFindings(db, notAdmin),
    ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  });

  it('integrity_finding is append-only at the DB level', async () => {
    const [row] = await db
      .insert(schema.integrityFinding)
      .values({ scanId: cid(), kind: 'TEST_APPEND_ONLY' })
      .returning();
    await expect(
      db
        .update(schema.integrityFinding)
        .set({ kind: 'x' })
        .where(sql`id = ${row!.id}`),
    ).rejects.toThrow(/PCS_IMMUTABLE/);
    await expect(db.delete(schema.integrityFinding).where(sql`id = ${row!.id}`)).rejects.toThrow(
      /PCS_IMMUTABLE/,
    );
  });
});
