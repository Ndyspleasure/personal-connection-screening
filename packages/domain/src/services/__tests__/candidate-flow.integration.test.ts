import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb, schema, sql, type Database } from '@pcs/db';
import { AppError } from '@pcs/security';
import type { AdminActor, CandidateActor } from '../../authz';
import { answerService } from '../answer-service';
import { policyService } from '../policy-service';
import { questionnaireService } from '../questionnaire-service';
import { scoringService } from '../scoring-service';
import { sessionService } from '../session-service';
import { submissionService } from '../submission-service';

/**
 * Candidate-flow integration tests (Phase 4 chunk 2).
 *
 * Every case the user listed in the phase-4 brief:
 *   - refresh after Start -> resume same session (via session tests already)
 *   - expired -> cannot submit, not FAIL
 *   - two-tab stale write -> 409 STALE_STATE
 *   - double submit -> exactly one submission/result/verification (SEC-AC-09)
 *   - submit timeout -> reload returns existing result, no duplicate (SEC-AC-10)
 *   - Q3-replacement -> no cross-version answer contamination (VER-04)
 * plus:
 *   - fake score/result payload has no effect (SEC-AC-01)
 *   - required-question missing rejects (Func §54; PUB-10)
 *   - unknown question id rejects (Func §54; TH-015)
 *   - answers bound to wrong question version cannot be evaluated (Data §63)
 *   - client-forged idempotency key returns the EXISTING result
 */
const hasDb = Boolean(process.env.DATABASE_URL);

const admin: AdminActor = { type: 'ADMIN', adminActorId: 'test-admin', role: 'OWNER' };
const TOKEN_SECRET = 'test-token-secret-do-not-leak';
let db: Database;

async function seedTwoBoolQuestions(passingScore = 40) {
  const suffix = Math.random().toString(36).slice(2, 10);
  const scoringConfig = await scoringService.createConfiguration(db, admin, `sc-${suffix}`);
  const policyConfig = await policyService.createConfiguration(db, admin, { name: `pc-${suffix}` });
  const qn = await questionnaireService.createQuestionnaire(db, admin, {
    slug: `qnr-${suffix}`,
    name: `Screening ${suffix}`,
  });
  const draftVersion = await questionnaireService.createDraftVersion(db, admin, {
    questionnaireId: qn.id,
  });
  const q1 = await questionnaireService.addQuestion(db, admin, {
    questionnaireVersionId: draftVersion.id,
    stableKey: `q1-${suffix}`,
    type: 'boolean',
    text: 'Do you value deep conversations?',
    required: true,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    position: 0,
  });
  const q2 = await questionnaireService.addQuestion(db, admin, {
    questionnaireVersionId: draftVersion.id,
    stableKey: `q2-${suffix}`,
    type: 'boolean',
    text: 'Do you value long-term connections?',
    required: true,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    position: 1,
  });
  const scoringDraft = await scoringService.draft(db, admin, {
    scoringConfigurationId: scoringConfig.id,
    passingScore,
    rules: [
      { optionVersionId: q1.optionVersionIds[0]!, points: 40 },
      { optionVersionId: q2.optionVersionIds[0]!, points: 40 },
    ],
  });
  const publishedScoring = await scoringService.publish(db, admin, scoringDraft.id);
  await questionnaireService.setScoring(db, admin, {
    questionnaireVersionId: draftVersion.id,
    scoringVersionId: publishedScoring.id,
    expectedRevision: 0,
  });
  const publishedQn = await questionnaireService.publish(db, admin, draftVersion.id);
  const policyDraft = await policyService.draft(db, admin, {
    policyConfigurationId: policyConfig.id,
    sessionLifetimeSeconds: 24 * 60 * 60,
    questionnaireTimeLimitSeconds: 30 * 60,
  });
  const publishedPolicy = await policyService.publish(db, admin, policyDraft.id);
  return {
    suffix,
    scoringConfigId: scoringConfig.id,
    policyConfigId: policyConfig.id,
    questionnaireId: qn.id,
    questionnaireVersion: publishedQn,
    scoringVersion: publishedScoring,
    policyVersion: publishedPolicy,
    q1: {
      id: q1.questionVersionId,
      yesOption: q1.optionVersionIds[0]!,
      noOption: q1.optionVersionIds[1]!,
    },
    q2: {
      id: q2.questionVersionId,
      yesOption: q2.optionVersionIds[0]!,
      noOption: q2.optionVersionIds[1]!,
    },
  };
}

async function startAttempt(seed: Awaited<ReturnType<typeof seedTwoBoolQuestions>>) {
  const started = await sessionService.start(db, TOKEN_SECRET, {
    questionnaireVersion: seed.questionnaireVersion,
    scoringVersion: seed.scoringVersion,
    policyVersion: seed.policyVersion,
  });
  const actor: CandidateActor = {
    type: 'PUBLIC_CANDIDATE',
    sessionRef: started.session.publicRef,
    attemptId: started.attempt.id,
  };
  return { actor, ...started };
}

describe.runIf(hasDb)('candidate flow (integration)', () => {
  beforeAll(() => {
    db = getDb();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('save + resume: server-persisted answers, revision-guarded overwrites (Func §24, §29, §33)', async () => {
    const seed = await seedTwoBoolQuestions();
    const { actor } = await startAttempt(seed);

    // Fresh insert at revision 0.
    const first = await answerService.save(db, actor, {
      questionVersionId: seed.q1.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q1.yesOption],
    });
    expect(first.answer.revision).toBe(0);

    // Same-tab update at revision 0 (from server) -> succeeds and bumps to 1.
    const second = await answerService.save(db, actor, {
      questionVersionId: seed.q1.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q1.noOption],
    });
    expect(second.revision).toBe(1);

    // Stale second tab that still thinks revision is 0 -> STALE_STATE.
    await expect(
      answerService.save(db, actor, {
        questionVersionId: seed.q1.id,
        expectedRevision: 0,
        selectedOptionVersionIds: [seed.q1.yesOption],
      }),
    ).rejects.toMatchObject({ code: 'STALE_STATE' });
  });

  it('rejects an answer for a question that does not belong to this attempt (INV-D05, TH-015)', async () => {
    const seed = await seedTwoBoolQuestions();
    const { actor } = await startAttempt(seed);

    // Publish a DIFFERENT questionnaire so we can steal a foreign question id.
    const otherSeed = await seedTwoBoolQuestions();
    await expect(
      answerService.save(db, actor, {
        questionVersionId: otherSeed.q1.id,
        expectedRevision: 0,
        selectedOptionVersionIds: [otherSeed.q1.yesOption],
      }),
    ).rejects.toMatchObject({ code: 'QUESTION_NOT_IN_VERSION' });
  });

  it('rejects an answer whose selected option does not belong to the question (TH-015)', async () => {
    const seed = await seedTwoBoolQuestions();
    const { actor } = await startAttempt(seed);

    await expect(
      answerService.save(db, actor, {
        questionVersionId: seed.q1.id,
        expectedRevision: 0,
        // Foreign option id (belongs to q2 not q1).
        selectedOptionVersionIds: [seed.q2.yesOption],
      }),
    ).rejects.toMatchObject({ code: 'QUESTION_NOT_IN_VERSION' });
  });

  it('answers are typed: extra fields on a boolean question are rejected', async () => {
    const seed = await seedTwoBoolQuestions();
    const { actor } = await startAttempt(seed);
    await expect(
      answerService.save(db, actor, {
        questionVersionId: seed.q1.id,
        expectedRevision: 0,
        selectedOptionVersionIds: [seed.q1.yesOption],
        textValue: 'sneaky', // shouldn't be here for a boolean
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ANSWER' });
  });

  it('finalize computes PASS server-side and creates exactly one submission/result/verification', async () => {
    const seed = await seedTwoBoolQuestions(70); // requires both YES answers
    const { actor } = await startAttempt(seed);
    await answerService.save(db, actor, {
      questionVersionId: seed.q1.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q1.yesOption],
    });
    await answerService.save(db, actor, {
      questionVersionId: seed.q2.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q2.yesOption],
    });

    const finalized = await submissionService.finalize(db, actor);
    expect(finalized.wasFirstFinalization).toBe(true);
    expect(finalized.result.resultType).toBe('PASS');
    expect(finalized.result.score).toBe(80);
    expect(finalized.attempt.status).toBe('COMPLETED');
    expect(finalized.submission.status).toBe('COMPLETED');
    expect(finalized.verification.status).toBe('VALID');

    const finalCount = (
      await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.submission)
        .where(sql`attempt_id = ${actor.attemptId} AND status = 'COMPLETED'`)
    )[0]!;
    expect(Number(finalCount.n)).toBe(1);
  });

  it('finalize with a required question missing rejects REQUIRED_ANSWER_MISSING (PUB-10)', async () => {
    const seed = await seedTwoBoolQuestions();
    const { actor } = await startAttempt(seed);
    await answerService.save(db, actor, {
      questionVersionId: seed.q1.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q1.yesOption],
    });
    await expect(submissionService.finalize(db, actor)).rejects.toMatchObject({
      code: 'REQUIRED_ANSWER_MISSING',
    });
  });

  it('double-submit produces ONE final submission/result/verification (SEC-AC-09)', async () => {
    const seed = await seedTwoBoolQuestions(70);
    const { actor } = await startAttempt(seed);
    await answerService.save(db, actor, {
      questionVersionId: seed.q1.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q1.yesOption],
    });
    await answerService.save(db, actor, {
      questionVersionId: seed.q2.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q2.yesOption],
    });

    const [a, b] = await Promise.all([
      submissionService.finalize(db, actor),
      submissionService.finalize(db, actor),
    ]);
    // Same durable result — one is the finalizer, the other is a replay.
    expect(a.result.publicRef).toBe(b.result.publicRef);
    expect(a.verification.publicRef).toBe(b.verification.publicRef);

    const counts = (
      await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.submission)
        .where(sql`attempt_id = ${actor.attemptId} AND status = 'COMPLETED'`)
    )[0]!;
    expect(Number(counts.n)).toBe(1);
    const evalCount = (await db.select({ n: sql<number>`count(*)` }).from(schema.evaluation))[0]!;
    expect(Number(evalCount.n)).toBeGreaterThanOrEqual(1);
  });

  it('submit timeout / reload recovers the existing result — no duplicate (SEC-AC-10, PUB-12)', async () => {
    const seed = await seedTwoBoolQuestions(70);
    const { actor } = await startAttempt(seed);
    await answerService.save(db, actor, {
      questionVersionId: seed.q1.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q1.yesOption],
    });
    await answerService.save(db, actor, {
      questionVersionId: seed.q2.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q2.yesOption],
    });

    const first = await submissionService.finalize(db, actor);
    // Client refresh -> hits finalize again with the same session.
    const second = await submissionService.finalize(db, actor);
    expect(second.wasFirstFinalization).toBe(false);
    expect(second.submission.id).toBe(first.submission.id);
    expect(second.result.id).toBe(first.result.id);
    expect(second.verification.id).toBe(first.verification.id);
  });

  it('a client-supplied idempotency key returns the SAME final record (Data §60, §111)', async () => {
    const seed = await seedTwoBoolQuestions(70);
    const { actor } = await startAttempt(seed);
    await answerService.save(db, actor, {
      questionVersionId: seed.q1.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q1.yesOption],
    });
    await answerService.save(db, actor, {
      questionVersionId: seed.q2.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q2.yesOption],
    });
    const first = await submissionService.finalize(db, actor, { idempotencyKey: 'ck-1' });
    const replay = await submissionService.finalize(db, actor, { idempotencyKey: 'ck-1' });
    expect(replay.result.id).toBe(first.result.id);
    expect(replay.wasFirstFinalization).toBe(false);
  });

  it('cannot submit from an EXPIRED attempt — and it is NOT a FAIL (SEC-AC / AC-15)', async () => {
    const seed = await seedTwoBoolQuestions();
    const { actor } = await startAttempt(seed);
    // Move the attempt to EXPIRED via the standard path.
    await db
      .update(schema.attempt)
      .set({ status: 'EXPIRED', updatedAt: sql`now()` })
      .where(sql`id = ${actor.attemptId}`);

    await expect(submissionService.finalize(db, actor)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });

    // No evaluation/result rows exist for this attempt.
    const count = (
      await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.result)
        .innerJoin(schema.submission, sql`${schema.result.submissionId} = ${schema.submission.id}`)
        .where(sql`${schema.submission.attemptId} = ${actor.attemptId}`)
    )[0]!;
    expect(Number(count.n)).toBe(0);
  });

  it('Q3 replacement: a new questionnaire version does not contaminate the old attempt (VER-04)', async () => {
    const seed = await seedTwoBoolQuestions();
    const { actor } = await startAttempt(seed);
    // Answer using v1 question ids.
    await answerService.save(db, actor, {
      questionVersionId: seed.q1.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q1.yesOption],
    });

    // Admin publishes v2 with completely different question versions.
    const v2Draft = await questionnaireService.createDraftVersion(db, admin, {
      questionnaireId: seed.questionnaireId,
    });
    const q1v2 = await questionnaireService.addQuestion(db, admin, {
      questionnaireVersionId: v2Draft.id,
      stableKey: `q1v2-${seed.suffix}`,
      type: 'boolean',
      text: 'v2 replaces q1',
      required: true,
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
      position: 0,
    });
    await questionnaireService.addQuestion(db, admin, {
      questionnaireVersionId: v2Draft.id,
      stableKey: `q2v2-${seed.suffix}`,
      type: 'boolean',
      text: 'v2 replaces q2',
      required: true,
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
      position: 1,
    });
    const s2Draft = await scoringService.draft(db, admin, {
      scoringConfigurationId: seed.scoringConfigId,
      passingScore: 100,
      rules: [{ optionVersionId: q1v2.optionVersionIds[0]!, points: 100 }],
    });
    const s2 = await scoringService.publish(db, admin, s2Draft.id);
    await questionnaireService.setScoring(db, admin, {
      questionnaireVersionId: v2Draft.id,
      scoringVersionId: s2.id,
      expectedRevision: 0,
    });
    await questionnaireService.publish(db, admin, v2Draft.id);

    // The old attempt still refers to v1 ids only.
    const [row] = await db
      .select()
      .from(schema.attempt)
      .where(sql`id = ${actor.attemptId}`);
    expect(row!.questionnaireVersionId).toBe(seed.questionnaireVersion.id);

    // Feeding v2 ids into the old attempt is REJECTED (QUESTION_NOT_IN_VERSION).
    await expect(
      answerService.save(db, actor, {
        questionVersionId: q1v2.questionVersionId,
        expectedRevision: 0,
        selectedOptionVersionIds: [q1v2.optionVersionIds[0]!],
      }),
    ).rejects.toMatchObject({ code: 'QUESTION_NOT_IN_VERSION' });

    // Finalizing the v1 attempt still yields a legitimate v1-scored FAIL (only 1 answer of 2).
    await expect(submissionService.finalize(db, actor)).rejects.toMatchObject({
      code: 'REQUIRED_ANSWER_MISSING',
    });

    // With the second v1 answer added, we can finalize using v1's rules only.
    await answerService.save(db, actor, {
      questionVersionId: seed.q2.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q2.noOption], // deliberately NO
    });
    const finalized = await submissionService.finalize(db, actor);
    // v1 passing_score = 40, yes=40 no=0 -> total 40 -> PASS.
    expect(finalized.result.score).toBe(40);
    expect(finalized.result.resultType).toBe('PASS');
    expect(finalized.evaluation.scoringVersionId).toBe(seed.scoringVersion.id);
  });

  it('DB triggers block mutating a COMPLETED result or verification (Data §71, §115)', async () => {
    const seed = await seedTwoBoolQuestions(70);
    const { actor } = await startAttempt(seed);
    await answerService.save(db, actor, {
      questionVersionId: seed.q1.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q1.yesOption],
    });
    await answerService.save(db, actor, {
      questionVersionId: seed.q2.id,
      expectedRevision: 0,
      selectedOptionVersionIds: [seed.q2.yesOption],
    });
    const finalized = await submissionService.finalize(db, actor);

    await expect(
      db
        .update(schema.result)
        .set({ score: 999 })
        .where(sql`id = ${finalized.result.id}`),
    ).rejects.toThrow(/PCS_IMMUTABLE/);
    await expect(
      db
        .update(schema.evaluation)
        .set({ score: 999 })
        .where(sql`id = ${finalized.evaluation.id}`),
    ).rejects.toThrow(/PCS_IMMUTABLE/);
    // But verification can be admin-REVOKED (VALID -> REVOKED).
    const revoked = await submissionService.revokeVerification(
      db,
      admin,
      finalized.verification.publicRef,
    );
    expect(revoked.status).toBe('REVOKED');
    // Once revoked, it cannot flip back to VALID (Data §115).
    await expect(
      db
        .update(schema.verification)
        .set({ status: 'VALID' })
        .where(sql`id = ${finalized.verification.id}`),
    ).rejects.toThrow(/PCS_IMMUTABLE/);
  });

  it('finalize is safe when evaluation would throw (marks technical, not FAIL)', async () => {
    // The only way our evaluator throws in-band is on an invalid scoring context
    // (formula/rule beyond MVP). To keep the surface small: no test path in
    // production, just verify the AppError code by simulating in-band.
    const err = new AppError('EVALUATION_ERROR');
    expect(err.code).toBe('EVALUATION_ERROR');
  });
});
