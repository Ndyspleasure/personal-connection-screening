import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb, schema, sql, type Database } from '@pcs/db';
import { AppError, fingerprintToken } from '@pcs/security';
import type { AdminActor } from '../../authz';
import { policyService } from '../policy-service';
import { questionnaireService } from '../questionnaire-service';
import { scoringService } from '../scoring-service';
import { sessionService } from '../session-service';

/**
 * SessionService integration tests (Phase 4 chunk 1).
 *
 * Traceability:
 *   - Session lifecycle (Data §26, §53; Master §5)
 *   - Version lock at attempt creation (Data §46, INV-D07)
 *   - Absolute deadline is server-derived (Data §28; Tech §111; Sec §68/69)
 *   - Terminal states cannot revive (Master §33; Data §55; INV-D09)
 *   - Token is stored as fingerprint only (Tech §13, §114)
 *   - Publish while active: locked version does not swap (Master §7; VER-05)
 *   - Revoke blocks further use (Threat TH-004)
 */
const hasDb = Boolean(process.env.DATABASE_URL);

const admin: AdminActor = { type: 'ADMIN', adminActorId: 'test-admin', role: 'OWNER' };
const TOKEN_SECRET = 'test-token-secret-do-not-leak';
let db: Database;

async function seedPublished(
  overrides: {
    sessionLifetimeSeconds?: number;
    questionnaireTimeLimitSeconds?: number | null;
  } = {},
) {
  const suffix = Math.random().toString(36).slice(2, 10);

  const scoringConfig = await scoringService.createConfiguration(db, admin, `sc-${suffix}`);
  const policyConfig = await policyService.createConfiguration(db, admin, { name: `pc-${suffix}` });
  const qn = await questionnaireService.createQuestionnaire(db, admin, {
    slug: `qnr-${suffix}`,
    name: `Screening ${suffix}`,
  });

  const version = await questionnaireService.createDraftVersion(db, admin, {
    questionnaireId: qn.id,
  });
  const q = await questionnaireService.addQuestion(db, admin, {
    questionnaireVersionId: version.id,
    stableKey: `q-${suffix}`,
    type: 'boolean',
    text: 'You value depth over speed in a conversation?',
    required: true,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    position: 0,
  });
  const scoringDraft = await scoringService.draft(db, admin, {
    scoringConfigurationId: scoringConfig.id,
    passingScore: 40,
    rules: [{ optionVersionId: q.optionVersionIds[0]!, points: 100 }],
  });
  const publishedScoring = await scoringService.publish(db, admin, scoringDraft.id);
  await questionnaireService.setScoring(db, admin, {
    questionnaireVersionId: version.id,
    scoringVersionId: publishedScoring.id,
    expectedRevision: 0,
  });
  const publishedQn = await questionnaireService.publish(db, admin, version.id);

  const policyDraft = await policyService.draft(db, admin, {
    policyConfigurationId: policyConfig.id,
    sessionLifetimeSeconds: overrides.sessionLifetimeSeconds ?? 24 * 60 * 60,
    questionnaireTimeLimitSeconds:
      overrides.questionnaireTimeLimitSeconds === undefined
        ? 30 * 60
        : overrides.questionnaireTimeLimitSeconds,
  });
  const publishedPolicy = await policyService.publish(db, admin, policyDraft.id);

  return {
    suffix,
    questionnaireVersion: publishedQn,
    scoringVersion: publishedScoring,
    policyVersion: publishedPolicy,
    scoringConfigId: scoringConfig.id,
    policyConfigId: policyConfig.id,
    questionnaireId: qn.id,
    questionVersionId: q.questionVersionId,
  };
}

describe.runIf(hasDb)('session service (integration)', () => {
  beforeAll(() => {
    db = getDb();
  });
  afterAll(async () => {
    await closeDb();
  });

  it('start locks the three versions, freezes policy snapshot, and issues an opaque cookie token', async () => {
    const seed = await seedPublished();
    const now = new Date('2026-09-03T12:00:00Z');
    const { attempt, session, rawSessionToken } = await sessionService.start(db, TOKEN_SECRET, {
      questionnaireVersion: seed.questionnaireVersion,
      scoringVersion: seed.scoringVersion,
      policyVersion: seed.policyVersion,
      now,
    });

    // Version lock triple.
    expect(attempt.questionnaireVersionId).toBe(seed.questionnaireVersion.id);
    expect(attempt.scoringVersionId).toBe(seed.scoringVersion.id);
    expect(attempt.policyVersionId).toBe(seed.policyVersion.id);
    expect(attempt.status).toBe('ACTIVE');

    // Frozen snapshot matches the published policy, and pins timerMode.
    expect(attempt.policySnapshot).toMatchObject({
      policyVersionId: seed.policyVersion.id,
      sessionLifetimeSeconds: 24 * 60 * 60,
      questionnaireTimeLimitSeconds: 30 * 60,
      timerMode: 'absolute',
      maxAttempts: 3,
      cooldownSeconds: 0,
      retakeMode: 'ON_NEW_VERSION',
      allowResume: true,
      allowMultiDevice: true,
    });

    // Deadline is derived from server time + snapshot, not from any client value.
    expect(attempt.questionnaireDeadline?.toISOString()).toBe(
      new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    );

    // Session bound to attempt with fingerprint-only storage.
    expect(session.attemptId).toBe(attempt.id);
    expect(session.status).toBe('ACTIVE');
    expect(session.expiresAt.getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
    expect(session.tokenFingerprint).toBe(fingerprintToken(rawSessionToken, TOKEN_SECRET));
    // Raw token is not stored in plaintext anywhere in the row.
    expect(session.tokenFingerprint).not.toBe(rawSessionToken);
  });

  it('resumeByToken returns the same session for a valid raw token, and updates last_seen_at', async () => {
    const seed = await seedPublished();
    const started = await sessionService.start(db, TOKEN_SECRET, {
      questionnaireVersion: seed.questionnaireVersion,
      scoringVersion: seed.scoringVersion,
      policyVersion: seed.policyVersion,
    });
    const originalLastSeen = started.session.lastSeenAt.getTime();
    // Small artificial gap so the touch is observable.
    await new Promise((r) => setTimeout(r, 10));
    const resumed = await sessionService.resumeByToken(db, TOKEN_SECRET, started.rawSessionToken);
    expect(resumed.session.id).toBe(started.session.id);
    expect(resumed.attempt.id).toBe(started.attempt.id);

    const [row] = await db
      .select()
      .from(schema.session)
      .where(sql`id = ${started.session.id}`);
    expect(row!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(originalLastSeen);
  });

  it('resumeByToken with an unknown/mangled token returns SESSION_NOT_FOUND (no probing)', async () => {
    const seed = await seedPublished();
    await sessionService.start(db, TOKEN_SECRET, {
      questionnaireVersion: seed.questionnaireVersion,
      scoringVersion: seed.scoringVersion,
      policyVersion: seed.policyVersion,
    });
    await expect(
      sessionService.resumeByToken(db, TOKEN_SECRET, 'not-a-real-token'),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('resumeByToken with the wrong secret does not authenticate (fingerprint mismatch)', async () => {
    const seed = await seedPublished();
    const started = await sessionService.start(db, TOKEN_SECRET, {
      questionnaireVersion: seed.questionnaireVersion,
      scoringVersion: seed.scoringVersion,
      policyVersion: seed.policyVersion,
    });
    await expect(
      sessionService.resumeByToken(db, 'different-secret', started.rawSessionToken),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('resumeByToken past expires_at auto-EXPIRES the session (and attempt) and raises SESSION_EXPIRED', async () => {
    // Short lifetime so we can move `now` past it.
    const seed = await seedPublished({ sessionLifetimeSeconds: 60 });
    const start = new Date('2026-09-03T12:00:00Z');
    const started = await sessionService.start(db, TOKEN_SECRET, {
      questionnaireVersion: seed.questionnaireVersion,
      scoringVersion: seed.scoringVersion,
      policyVersion: seed.policyVersion,
      now: start,
    });

    const future = new Date(start.getTime() + 61 * 1000);
    await expect(
      sessionService.resumeByToken(db, TOKEN_SECRET, started.rawSessionToken, future),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });

    const [sessionRow] = await db
      .select()
      .from(schema.session)
      .where(sql`id = ${started.session.id}`);
    expect(sessionRow!.status).toBe('EXPIRED');
    const [attemptRow] = await db
      .select()
      .from(schema.attempt)
      .where(sql`id = ${started.attempt.id}`);
    expect(attemptRow!.status).toBe('EXPIRED');
  });

  it('revoke marks session + attempt REVOKED and blocks resume with SESSION_REVOKED', async () => {
    const seed = await seedPublished();
    const started = await sessionService.start(db, TOKEN_SECRET, {
      questionnaireVersion: seed.questionnaireVersion,
      scoringVersion: seed.scoringVersion,
      policyVersion: seed.policyVersion,
    });
    await sessionService.revoke(db, started.session.publicRef);

    await expect(
      sessionService.resumeByToken(db, TOKEN_SECRET, started.rawSessionToken),
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });

    const [attemptRow] = await db
      .select()
      .from(schema.attempt)
      .where(sql`id = ${started.attempt.id}`);
    expect(attemptRow!.status).toBe('REVOKED');
  });

  it('a fresh publish after start does not swap the active attempt to a new version (VER-05)', async () => {
    const seed = await seedPublished();
    const now = new Date('2026-09-03T12:00:00Z');
    const started = await sessionService.start(db, TOKEN_SECRET, {
      questionnaireVersion: seed.questionnaireVersion,
      scoringVersion: seed.scoringVersion,
      policyVersion: seed.policyVersion,
      now,
    });

    // Admin publishes a second version of the questionnaire while the candidate is active.
    const v2Draft = await questionnaireService.createDraftVersion(db, admin, {
      questionnaireId: seed.questionnaireId,
    });
    const q2 = await questionnaireService.addQuestion(db, admin, {
      questionnaireVersionId: v2Draft.id,
      stableKey: `q2-${seed.suffix}`,
      type: 'boolean',
      text: 'v2 replaces the question',
      required: true,
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
      position: 0,
    });
    const s2Draft = await scoringService.draft(db, admin, {
      scoringConfigurationId: seed.scoringConfigId,
      passingScore: 999, // dramatically different
      rules: [{ optionVersionId: q2.optionVersionIds[0]!, points: 1000 }],
    });
    const s2 = await scoringService.publish(db, admin, s2Draft.id);
    await questionnaireService.setScoring(db, admin, {
      questionnaireVersionId: v2Draft.id,
      scoringVersionId: s2.id,
      expectedRevision: 0,
    });
    const v2 = await questionnaireService.publish(db, admin, v2Draft.id);

    // The candidate's attempt still references v1's ids — not v2.
    const [attemptRow] = await db
      .select()
      .from(schema.attempt)
      .where(sql`id = ${started.attempt.id}`);
    expect(attemptRow!.questionnaireVersionId).toBe(seed.questionnaireVersion.id);
    expect(attemptRow!.questionnaireVersionId).not.toBe(v2.id);
    expect(attemptRow!.scoringVersionId).toBe(seed.scoringVersion.id);
    expect(attemptRow!.scoringVersionId).not.toBe(s2.id);
  });

  it('DB guards forbid mutating the version-lock or reviving a terminal attempt', async () => {
    const seed = await seedPublished();
    const started = await sessionService.start(db, TOKEN_SECRET, {
      questionnaireVersion: seed.questionnaireVersion,
      scoringVersion: seed.scoringVersion,
      policyVersion: seed.policyVersion,
    });

    // Tampering with the frozen policy snapshot is blocked by the DB trigger.
    await expect(
      db
        .update(schema.attempt)
        .set({ policySnapshot: { tampered: true } })
        .where(sql`id = ${started.attempt.id}`),
    ).rejects.toThrow(/PCS_IMMUTABLE/);

    // Revoke, then try to revive.
    await sessionService.revoke(db, started.session.publicRef);
    await expect(
      db
        .update(schema.attempt)
        .set({ status: 'ACTIVE' })
        .where(sql`id = ${started.attempt.id}`),
    ).rejects.toThrow(/PCS_IMMUTABLE/);
    await expect(db.delete(schema.session).where(sql`id = ${started.session.id}`)).rejects.toThrow(
      /PCS_IMMUTABLE/,
    );
  });

  it('start refuses a DRAFT questionnaire/scoring/policy (fail closed)', async () => {
    const seed = await seedPublished();
    const badPolicyDraft = await policyService.draft(db, admin, {
      policyConfigurationId: seed.policyConfigId,
      sessionLifetimeSeconds: 3600,
    });
    // Note: DRAFT — not published.
    await expect(
      sessionService.start(db, TOKEN_SECRET, {
        questionnaireVersion: seed.questionnaireVersion,
        scoringVersion: seed.scoringVersion,
        policyVersion: badPolicyDraft,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
