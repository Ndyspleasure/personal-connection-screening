import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, getDb, schema, sql, type Database } from '@pcs/db';
import type { AdminActor, CandidateActor } from '../../authz';
import { questionnaireAdminService } from '../questionnaire-admin-service';
import { MIGRATIONS_DIR, recreateDatabase, withDatabase } from './hermetic-db';

/**
 * Questionnaire builder (admin orchestration) integration tests (Phase 5 chunk
 * 2). Runs against its own hermetic database because `list()` enumerates ALL
 * questionnaires and slugs are globally unique.
 */
const BASE_DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/pcs';
const HERMETIC_DB = process.env.QADMIN_IT_DB ?? 'pcs_qadmin_it';
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

async function addBool(versionId: string, text: string) {
  return questionnaireAdminService.addQuestion(
    db,
    admin,
    versionId,
    {
      type: 'boolean',
      text,
      required: true,
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
    { correlationId: cid() },
  );
}

describe.runIf(hasDb)('questionnaire builder (integration)', () => {
  beforeAll(async () => {
    await recreateDatabase(BASE_DB_URL, HERMETIC_DB);
    db = getDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  });
  afterAll(async () => {
    await closeDb();
  });

  it('rejects a non-admin (Threat TH-042)', async () => {
    await expect(
      // @ts-expect-error candidate where admin required
      questionnaireAdminService.list(db, notAdmin),
    ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  });

  it('builds, scores, and publishes a version; the current pointer moves and detail reflects it', async () => {
    const { questionnaire, draftVersion } = await questionnaireAdminService.createQuestionnaire(
      db,
      admin,
      { slug: 'screening-a', name: 'Screening A' },
      { correlationId: cid() },
    );
    const q1 = await addBool(draftVersion.id, 'Value deep conversations?');
    const q2 = await addBool(draftVersion.id, 'Value long-term connections?');

    // Detail shows both questions, in order, with options.
    const draftDetail = await questionnaireAdminService.getVersionDetail(
      db,
      admin,
      draftVersion.id,
    );
    expect(draftDetail.status).toBe('DRAFT');
    expect(draftDetail.questions).toHaveLength(2);
    expect(draftDetail.questions[0]!.options).toHaveLength(2);

    // Publish with both "yes" options worth 40, passing at 70.
    const published = await questionnaireAdminService.publishWithScoring(
      db,
      admin,
      draftVersion.id,
      {
        passingScore: 70,
        rules: [
          { optionVersionId: q1.optionVersionIds[0]!, points: 40 },
          { optionVersionId: q2.optionVersionIds[0]!, points: 40 },
        ],
      },
      { correlationId: cid() },
    );
    expect(published.status).toBe('PUBLISHED');

    // The questionnaire's current pointer now targets this version.
    const detail = await questionnaireAdminService.getVersionDetail(db, admin, draftVersion.id);
    expect(detail.isCurrent).toBe(true);
    expect(detail.scoring?.passingScore).toBe(70);

    const list = await questionnaireAdminService.list(db, admin);
    const item = list.find((x) => x.id === questionnaire.id)!;
    expect(item.currentVersionId).toBe(draftVersion.id);
    expect(item.versions.find((v) => v.id === draftVersion.id)?.status).toBe('PUBLISHED');

    // Audit trail recorded create + publish.
    const events = await db
      .select()
      .from(schema.auditEvent)
      .where(sql`entity_id = ${draftVersion.id} OR entity_id = ${questionnaire.id}`);
    const actions = events.map((e) => e.action);
    expect(actions).toContain('questionnaire.created');
    expect(actions).toContain('questionnaire.published');
  });

  it('refuses to publish a draft with no scoreable options (needs at least one rule)', async () => {
    const { draftVersion } = await questionnaireAdminService.createQuestionnaire(
      db,
      admin,
      { slug: 'screening-empty', name: 'Empty' },
      { correlationId: cid() },
    );
    await questionnaireAdminService.addQuestion(
      db,
      admin,
      draftVersion.id,
      { type: 'text', text: 'Tell us about yourself', required: true },
      { correlationId: cid() },
    );
    await expect(
      questionnaireAdminService.publishWithScoring(
        db,
        admin,
        draftVersion.id,
        { passingScore: 1, rules: [] },
        { correlationId: cid() },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('archives a published version and clears the current pointer', async () => {
    const { questionnaire, draftVersion } = await questionnaireAdminService.createQuestionnaire(
      db,
      admin,
      { slug: 'screening-b', name: 'Screening B' },
      { correlationId: cid() },
    );
    const q = await addBool(draftVersion.id, 'Only question');
    await questionnaireAdminService.publishWithScoring(
      db,
      admin,
      draftVersion.id,
      { passingScore: 1, rules: [{ optionVersionId: q.optionVersionIds[0]!, points: 10 }] },
      { correlationId: cid() },
    );
    const archived = await questionnaireAdminService.archive(db, admin, draftVersion.id, {
      correlationId: cid(),
    });
    expect(archived.status).toBe('ARCHIVED');
    const list = await questionnaireAdminService.list(db, admin);
    expect(list.find((x) => x.id === questionnaire.id)?.currentVersionId).toBeNull();
  });
});
