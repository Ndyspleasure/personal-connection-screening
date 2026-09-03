import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb, schema, sql, type Database } from '@pcs/db';
import { AppError } from '@pcs/security';
import type { AdminActor } from '../../authz';
import { buildOptionScores, evaluate } from '../../evaluation/engine';
import { policyService } from '../policy-service';
import { questionnaireService } from '../questionnaire-service';
import { scoringService } from '../scoring-service';

/**
 * Publish-workflow integration tests (Phase 3 remainder).
 *
 * Runs against real PostgreSQL. Every invariant asserted here maps back to the
 * source specifications:
 *   - publish workflow (Master §7, §25; Functional §83–86, §110; Tech Arch §28, §104)
 *   - published version immutable (Data §71, §74; INV-D08; Threat TH-033/34)
 *   - new version does not alter old (Data §51, §92, §110; AC VER-05/06)
 *   - active sessions/attempts remain locked to their locked versions
 *       (Data §46, §91; INV-D07; AC-02/VER-05)
 *   - historical results untouched by scoring changes (Data §92, §110; AC VER-06)
 *   - invalid drafts cannot be published (Master §25; Functional §84; Tech §130)
 *   - concurrent publish / stale edit cannot silently overwrite
 *       (Data §57–59, §85; INV-C02; Func §113)
 */
const hasDb = Boolean(process.env.DATABASE_URL);

const admin: AdminActor = { type: 'ADMIN', adminActorId: 'test-admin', role: 'OWNER' };
let db: Database;

/** Isolate each test by ownership on a fresh scoring/policy/questionnaire triple. */
async function scaffold() {
  const suffix = Math.random().toString(36).slice(2, 10);
  const scoringConfig = await scoringService.createConfiguration(db, admin, `sc-${suffix}`);
  const policyConfig = await policyService.createConfiguration(db, admin, { name: `pc-${suffix}` });
  const questionnaire = await questionnaireService.createQuestionnaire(db, admin, {
    slug: `qnr-${suffix}`,
    name: `Screening ${suffix}`,
  });
  return {
    suffix,
    scoringConfigId: scoringConfig.id,
    policyConfigId: policyConfig.id,
    questionnaireId: questionnaire.id,
  };
}

/**
 * Build a complete publishable questionnaire: 2 boolean questions with yes/no
 * options; publish scoring first (rules point at the option-version ids of the
 * DRAFT bindings, which the DB has already created), then publish the version.
 */
async function buildPublishable(qnId: string, scoringConfigId: string, passingScore: number) {
  const version = await questionnaireService.createDraftVersion(db, admin, {
    questionnaireId: qnId,
  });
  const suffix = Math.random().toString(36).slice(2, 10);
  const q1 = await questionnaireService.addQuestion(db, admin, {
    questionnaireVersionId: version.id,
    stableKey: `q1-${suffix}`,
    type: 'boolean',
    text: 'Do you enjoy deep conversations?',
    required: true,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    position: 0,
  });
  const q2 = await questionnaireService.addQuestion(db, admin, {
    questionnaireVersionId: version.id,
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
  // First option of each question = "yes" → 40 points.
  const draftScoring = await scoringService.draft(db, admin, {
    scoringConfigurationId: scoringConfigId,
    passingScore,
    rules: [
      { optionVersionId: q1.optionVersionIds[0]!, points: 40 },
      { optionVersionId: q2.optionVersionIds[0]!, points: 40 },
    ],
  });
  const publishedScoring = await scoringService.publish(db, admin, draftScoring.id);
  await questionnaireService.setScoring(db, admin, {
    questionnaireVersionId: version.id,
    scoringVersionId: publishedScoring.id,
    expectedRevision: 0,
  });
  return { versionId: version.id, scoringVersionId: publishedScoring.id, q1, q2 };
}

describe.runIf(hasDb)('publish workflow (integration)', () => {
  beforeAll(() => {
    db = getDb();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('DRAFT → VALIDATE → freeze → PUBLISHED → current pointer moved', async () => {
    const s = await scaffold();
    const built = await buildPublishable(s.questionnaireId, s.scoringConfigId, 70);
    const published = await questionnaireService.publish(db, admin, built.versionId);

    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).not.toBeNull();

    // current pointer moved.
    const qnRows = await db
      .select()
      .from(schema.questionnaire)
      .where(sql`id = ${s.questionnaireId}`);
    expect(qnRows[0]?.currentVersionId).toBe(built.versionId);

    // question versions frozen to PUBLISHED.
    const qvRows = await db
      .select()
      .from(schema.questionVersion)
      .where(sql`id in (${built.q1.questionVersionId}, ${built.q2.questionVersionId})`);
    expect(qvRows.every((r) => r.status === 'PUBLISHED')).toBe(true);
  });

  it('published version cannot be mutated (DB trigger fires)', async () => {
    const s = await scaffold();
    const built = await buildPublishable(s.questionnaireId, s.scoringConfigId, 70);
    await questionnaireService.publish(db, admin, built.versionId);

    await expect(
      db
        .update(schema.questionnaireVersion)
        .set({ scoringVersionId: null })
        .where(sql`id = ${built.versionId}`),
    ).rejects.toThrow(/PCS_IMMUTABLE/);

    await expect(
      db
        .update(schema.questionVersion)
        .set({ text: 'tampered' })
        .where(sql`id = ${built.q1.questionVersionId}`),
    ).rejects.toThrow(/PCS_IMMUTABLE/);

    await expect(
      db
        .update(schema.answerOptionVersion)
        .set({ label: 'tampered' })
        .where(sql`id = ${built.q1.optionVersionIds[0]}`),
    ).rejects.toThrow(/PCS_IMMUTABLE/);

    await expect(
      db.delete(schema.answerOptionVersion).where(sql`id = ${built.q1.optionVersionIds[0]}`),
    ).rejects.toThrow(/PCS_IMMUTABLE/);
  });

  it('publish creates a new version that does not alter the old (Data §51, §110)', async () => {
    const s = await scaffold();
    const built1 = await buildPublishable(s.questionnaireId, s.scoringConfigId, 70);
    const v1 = await questionnaireService.publish(db, admin, built1.versionId);

    const built2 = await buildPublishable(s.questionnaireId, s.scoringConfigId, 75);
    const v2 = await questionnaireService.publish(db, admin, built2.versionId);

    expect(v1.id).not.toBe(v2.id);
    expect(v2.versionNumber).toBe(v1.versionNumber + 1);

    // v1's row is still exactly what it was (only status can be flipped to ARCHIVED).
    const [v1Now] = await db
      .select()
      .from(schema.questionnaireVersion)
      .where(sql`id = ${v1.id}`);
    expect(v1Now?.status).toBe('PUBLISHED');
    expect(v1Now?.scoringVersionId).toBe(v1.scoringVersionId);
    expect(v1Now?.versionNumber).toBe(v1.versionNumber);

    // Current pointer now points at v2 (Data §10, §91).
    const [qn] = await db
      .select()
      .from(schema.questionnaire)
      .where(sql`id = ${s.questionnaireId}`);
    expect(qn?.currentVersionId).toBe(v2.id);
  });

  it('an "attempt" locked to v1 keeps evaluating against v1 rules after v2 publishes (Data §46, §92)', async () => {
    const s = await scaffold();
    const built1 = await buildPublishable(s.questionnaireId, s.scoringConfigId, 70);
    const v1 = await questionnaireService.publish(db, admin, built1.versionId);

    // Snapshot the locked scoring context on the "attempt".
    const lockedRules = await db
      .select()
      .from(schema.scoringRule)
      .where(sql`scoring_version_id = ${v1.scoringVersionId}`);
    const lockedPassing = (
      await db
        .select()
        .from(schema.scoringVersion)
        .where(sql`id = ${v1.scoringVersionId}`)
    )[0]!.passingScore;

    // A newer version publishes with a different rule set and a much higher passing score.
    const built2 = await buildPublishable(s.questionnaireId, s.scoringConfigId, 200);
    await questionnaireService.publish(db, admin, built2.versionId);

    // Evaluate a "yes,yes" attempt against the LOCKED v1 context.
    const outcome = evaluate(
      [
        {
          questionVersionId: built1.q1.questionVersionId,
          selectedOptionVersionIds: [built1.q1.optionVersionIds[0]!],
        },
        {
          questionVersionId: built1.q2.questionVersionId,
          selectedOptionVersionIds: [built1.q2.optionVersionIds[0]!],
        },
      ],
      {
        scoringVersionId: v1.scoringVersionId!,
        passingScore: lockedPassing,
        passingRule: 'gte',
        formulaType: 'weighted_sum',
        optionScores: buildOptionScores(
          lockedRules.map((r) => ({
            optionVersionId: r.optionVersionId,
            points: r.points,
            weight: r.weight,
          })),
        ),
      },
    );
    expect(outcome).toEqual({ score: 80, passingScore: 70, result: 'PASS' });
  });

  it('a historical result stays PASS even after the current scoring/passing changes (AC VER-06/07)', async () => {
    const s = await scaffold();
    const built1 = await buildPublishable(s.questionnaireId, s.scoringConfigId, 70);
    const v1 = await questionnaireService.publish(db, admin, built1.versionId);

    // Simulate a persisted historical result: score 80, passing 70, PASS.
    const historical = {
      score: 80,
      passingScore: 70,
      result: 'PASS' as const,
      scoringVersionId: v1.scoringVersionId!,
    };

    // Publish v2 with a new scoring version and a much higher passing score.
    const built2 = await buildPublishable(s.questionnaireId, s.scoringConfigId, 200);
    await questionnaireService.publish(db, admin, built2.versionId);

    // Re-fetching the historical scoring version shows it is unchanged.
    const [sv] = await db
      .select()
      .from(schema.scoringVersion)
      .where(sql`id = ${historical.scoringVersionId}`);
    expect(sv?.passingScore).toBe(70);
    expect(sv?.status).toBe('PUBLISHED');

    // The historical record is unaffected by the current state.
    expect(historical.result).toBe('PASS');
  });

  it('invalid drafts cannot be published: no bindings', async () => {
    const s = await scaffold();
    // Build a real option-version on a SEPARATE draft version so we can point a
    // scoring rule at a valid FK, then attach that scoring to a different draft
    // that has NO bindings — the publish should fail on empty bindings.
    const helper = await questionnaireService.createDraftVersion(db, admin, {
      questionnaireId: s.questionnaireId,
    });
    const helperQ = await questionnaireService.addQuestion(db, admin, {
      questionnaireVersionId: helper.id,
      stableKey: `helper-${s.suffix}`,
      type: 'boolean',
      text: 't',
      required: true,
      options: [
        { value: 'y', label: 'Y' },
        { value: 'n', label: 'N' },
      ],
      position: 0,
    });
    const scoringDraft = await scoringService.draft(db, admin, {
      scoringConfigurationId: s.scoringConfigId,
      passingScore: 10,
      rules: [{ optionVersionId: helperQ.optionVersionIds[0]!, points: 5 }],
    });
    await scoringService.publish(db, admin, scoringDraft.id);

    // Now a fresh draft with NO bindings, attached to that scoring.
    const empty = await questionnaireService.createDraftVersion(db, admin, {
      questionnaireId: s.questionnaireId,
    });
    await questionnaireService.setScoring(db, admin, {
      questionnaireVersionId: empty.id,
      scoringVersionId: scoringDraft.id,
      expectedRevision: 0,
    });
    await expect(questionnaireService.publish(db, admin, empty.id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('invalid drafts cannot be published: missing scoring context', async () => {
    const s = await scaffold();
    const version = await questionnaireService.createDraftVersion(db, admin, {
      questionnaireId: s.questionnaireId,
    });
    // Add one question so bindings check passes; leave scoring null.
    await questionnaireService.addQuestion(db, admin, {
      questionnaireVersionId: version.id,
      stableKey: `k-${s.suffix}-a`,
      type: 'boolean',
      text: 't',
      options: [
        { value: 'y', label: 'Y' },
        { value: 'n', label: 'N' },
      ],
      position: 0,
    });
    await expect(questionnaireService.publish(db, admin, version.id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('invalid drafts cannot be published: scoring must itself be PUBLISHED first', async () => {
    const s = await scaffold();
    const version = await questionnaireService.createDraftVersion(db, admin, {
      questionnaireId: s.questionnaireId,
    });
    const q = await questionnaireService.addQuestion(db, admin, {
      questionnaireVersionId: version.id,
      stableKey: `k-${s.suffix}-b`,
      type: 'boolean',
      text: 't',
      required: true,
      options: [
        { value: 'y', label: 'Y' },
        { value: 'n', label: 'N' },
      ],
      position: 0,
    });
    const scoringDraft = await scoringService.draft(db, admin, {
      scoringConfigurationId: s.scoringConfigId,
      passingScore: 10,
      rules: [{ optionVersionId: q.optionVersionIds[0]!, points: 5 }],
    });
    // Attach DRAFT scoring (not published).
    await questionnaireService.setScoring(db, admin, {
      questionnaireVersionId: version.id,
      scoringVersionId: scoringDraft.id,
      expectedRevision: 0,
    });
    await expect(questionnaireService.publish(db, admin, version.id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('concurrent publishes on the same draft: exactly one wins (Data §85, INV-C01)', async () => {
    const s = await scaffold();
    const built = await buildPublishable(s.questionnaireId, s.scoringConfigId, 70);
    const results = await Promise.allSettled([
      questionnaireService.publish(db, admin, built.versionId),
      questionnaireService.publish(db, admin, built.versionId),
    ]);
    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    const err = (failures[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('CONFLICT');
  });

  it('optimistic concurrency on draft edits: stale revision is rejected (Data §57–59, Func §113)', async () => {
    const s = await scaffold();
    const version = await questionnaireService.createDraftVersion(db, admin, {
      questionnaireId: s.questionnaireId,
    });
    // Draft two disjoint scoring versions so we can flip between them.
    const q = await questionnaireService.addQuestion(db, admin, {
      questionnaireVersionId: version.id,
      stableKey: `k-${s.suffix}-cc`,
      type: 'boolean',
      text: 't',
      required: true,
      options: [
        { value: 'y', label: 'Y' },
        { value: 'n', label: 'N' },
      ],
      position: 0,
    });
    const s1 = await scoringService.draft(db, admin, {
      scoringConfigurationId: s.scoringConfigId,
      passingScore: 10,
      rules: [{ optionVersionId: q.optionVersionIds[0]!, points: 20 }],
    });
    await scoringService.publish(db, admin, s1.id);
    const s2 = await scoringService.draft(db, admin, {
      scoringConfigurationId: s.scoringConfigId,
      passingScore: 15,
      rules: [{ optionVersionId: q.optionVersionIds[0]!, points: 25 }],
    });
    await scoringService.publish(db, admin, s2.id);
    // First edit at revision 0 succeeds and bumps revision to 1.
    await questionnaireService.setScoring(db, admin, {
      questionnaireVersionId: version.id,
      scoringVersionId: s1.id,
      expectedRevision: 0,
    });
    // Second edit that thinks revision is still 0 must fail.
    await expect(
      questionnaireService.setScoring(db, admin, {
        questionnaireVersionId: version.id,
        scoringVersionId: s2.id,
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'STALE_STATE' });
    // The successful edit is still recorded.
    const [row] = await db
      .select()
      .from(schema.questionnaireVersion)
      .where(sql`id = ${version.id}`);
    expect(row?.scoringVersionId).toBe(s1.id);
    expect(row?.revision).toBe(1);
  });

  it('publish requires an admin actor (NOT_AUTHORIZED for a candidate)', async () => {
    const s = await scaffold();
    const built = await buildPublishable(s.questionnaireId, s.scoringConfigId, 70);
    const candidate = {
      type: 'PUBLIC_CANDIDATE' as const,
      sessionRef: 'ses_x',
      attemptId: 'att_x',
    };
    await expect(
      questionnaireService.publish(db, candidate, built.versionId),
    ).rejects.toMatchObject({
      code: 'NOT_AUTHORIZED',
    });
  });

  it('scoring/policy validation rejects bad drafts before touching the DB', async () => {
    const s = await scaffold();
    await expect(
      scoringService.draft(db, admin, {
        scoringConfigurationId: s.scoringConfigId,
        passingScore: -1,
        rules: [{ optionVersionId: '00000000-0000-0000-0000-000000000000', points: 5 }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      policyService.draft(db, admin, {
        policyConfigurationId: s.policyConfigId,
        sessionLifetimeSeconds: 30, // below minimum
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
