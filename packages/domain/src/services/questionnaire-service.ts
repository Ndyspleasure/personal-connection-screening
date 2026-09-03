import {
  bindQuestionVersion,
  casArchiveQuestionnaireVersion,
  casPublishQuestionnaireVersion,
  casUpdateQuestionnaireVersionScoring,
  clearPointerIfEquals,
  createQuestionWithVersionAndOptions,
  createQuestionnaire,
  freezeQuestionVersions,
  getQuestionnaire,
  getQuestionnaireVersion,
  getScoringVersion,
  insertDraftQuestionnaireVersion,
  listBindings,
  listOptionsByQuestionVersionIds,
  listScoringRules,
  moveCurrentPointer,
  nextQuestionnaireVersionNumber,
  type Database,
} from '@pcs/db';
import { AppError } from '@pcs/security';
import type { Actor } from '../authz';
import { assertAdmin } from './errors';

/**
 * QuestionnaireService — the publish workflow orchestrator
 *   (Master Spec §7, §25; Functional Spec §83–86, §110; Tech Arch §28, §104).
 *
 * Pipeline (in one DB transaction so the whole thing is atomic):
 *   1. Load the DRAFT questionnaire version FOR UPDATE.
 *   2. Validate structure: has bindings, no duplicate positions, has scoring,
 *      option-set integrity, scoring rules reference bindings' options only.
 *   3. Freeze children: mark bound question versions PUBLISHED (option versions
 *      inherit their frozen status via the parent — enforced by DB triggers).
 *   4. CAS the questionnaire version DRAFT → PUBLISHED (only the winner
 *      finalizes).
 *   5. Move the questionnaire's current-version pointer to the new version.
 *
 * All destructive mutations against a PUBLISHED version are blocked by DB-level
 * triggers (Data §71, §74; INV-D08; migration 0003_immutability_guards).
 */

export const questionnaireService = {
  // --- authoring -------------------------------------------------------------

  async createQuestionnaire(db: Database, actor: Actor, input: { slug: string; name: string }) {
    assertAdmin(actor);
    return db.transaction(async (tx) => createQuestionnaire(tx, input));
  },

  async createDraftVersion(
    db: Database,
    actor: Actor,
    input: { questionnaireId: string; scoringVersionId?: string | null },
  ) {
    assertAdmin(actor);
    return db.transaction(async (tx) => {
      const parent = await getQuestionnaire(tx, input.questionnaireId);
      if (!parent) throw new AppError('NOT_FOUND', 'questionnaire not found');
      const versionNumber = await nextQuestionnaireVersionNumber(tx, input.questionnaireId);
      return insertDraftQuestionnaireVersion(tx, {
        questionnaireId: input.questionnaireId,
        versionNumber,
        scoringVersionId: input.scoringVersionId ?? null,
      });
    });
  },

  /** Attach a scoring version to a DRAFT questionnaire (optimistic-concurrency). */
  async setScoring(
    db: Database,
    actor: Actor,
    input: {
      questionnaireVersionId: string;
      scoringVersionId: string | null;
      expectedRevision: number;
    },
  ) {
    assertAdmin(actor);
    const won = await db.transaction(async (tx) =>
      casUpdateQuestionnaireVersionScoring(tx, {
        id: input.questionnaireVersionId,
        expectedRevision: input.expectedRevision,
        scoringVersionId: input.scoringVersionId,
      }),
    );
    if (!won) throw new AppError('STALE_STATE', 'draft was updated elsewhere');
  },

  async addQuestion(
    db: Database,
    actor: Actor,
    input: {
      questionnaireVersionId: string;
      stableKey: string;
      type: string;
      text: string;
      description?: string | null;
      required?: boolean;
      options?: { value: string; label: string }[];
      position: number;
    },
  ) {
    assertAdmin(actor);
    return db.transaction(async (tx) => {
      const qv = await getQuestionnaireVersion(tx, input.questionnaireVersionId, true);
      if (!qv) throw new AppError('NOT_FOUND', 'questionnaire version not found');
      if (qv.status !== 'DRAFT') {
        throw new AppError('CONFLICT', 'cannot add questions to a non-DRAFT version');
      }
      const created = await createQuestionWithVersionAndOptions(tx, {
        stableKey: input.stableKey,
        type: input.type,
        text: input.text,
        description: input.description ?? null,
        required: input.required ?? false,
        options: input.options ?? [],
      });
      await bindQuestionVersion(tx, {
        questionnaireVersionId: input.questionnaireVersionId,
        questionVersionId: created.questionVersionId,
        position: input.position,
      });
      return created;
    });
  },

  // --- publish workflow -----------------------------------------------------

  /**
   * Publish a DRAFT questionnaire version. Atomic per §84–86, §110. Validation
   * failure aborts before mutating anything. Concurrent publishes see one
   * winner (CAS on `status = DRAFT`).
   */
  async publish(db: Database, actor: Actor, questionnaireVersionId: string) {
    assertAdmin(actor);
    return db.transaction(async (tx) => {
      const qv = await getQuestionnaireVersion(tx, questionnaireVersionId, true);
      if (!qv) throw new AppError('NOT_FOUND', 'questionnaire version not found');
      if (qv.status === 'PUBLISHED') throw new AppError('CONFLICT', 'already published');
      if (qv.status !== 'DRAFT') {
        throw new AppError('CONFLICT', `cannot publish version in status ${qv.status}`);
      }
      if (!qv.scoringVersionId) {
        throw new AppError('VALIDATION_ERROR', 'questionnaire version has no scoring context');
      }

      const scoring = await getScoringVersion(tx, qv.scoringVersionId);
      if (!scoring) throw new AppError('VALIDATION_ERROR', 'referenced scoring version not found');
      if (scoring.status !== 'PUBLISHED') {
        throw new AppError('VALIDATION_ERROR', 'scoring version must be published first');
      }

      const bindings = await listBindings(tx, qv.id);
      if (bindings.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'questionnaire version has no questions');
      }
      const positions = new Set<number>();
      for (const b of bindings) {
        if (positions.has(b.position)) {
          throw new AppError('VALIDATION_ERROR', `duplicate position ${b.position}`);
        }
        positions.add(b.position);
      }

      const questionVersionIds = bindings.map((b) => b.questionVersionId);
      const options = await listOptionsByQuestionVersionIds(tx, questionVersionIds);
      const optionByQv = new Map<string, string[]>();
      for (const opt of options) {
        const list = optionByQv.get(opt.questionVersionId) ?? [];
        list.push(opt.id);
        optionByQv.set(opt.questionVersionId, list);
      }
      // Choice questions must have at least one option so answers can be scored.
      const rules = await listScoringRules(tx, scoring.id);
      const scoredOptionIds = new Set(
        rules.map((r) => r.optionVersionId).filter((v): v is string => Boolean(v)),
      );
      const bindingOptionIds = new Set(options.map((o) => o.id));
      for (const ruleOptionId of scoredOptionIds) {
        if (!bindingOptionIds.has(ruleOptionId)) {
          throw new AppError(
            'VALIDATION_ERROR',
            `scoring rule references option ${ruleOptionId} not in this questionnaire version`,
          );
        }
      }

      // Freeze children before flipping the parent.
      await freezeQuestionVersions(tx, questionVersionIds);

      const won = await casPublishQuestionnaireVersion(tx, qv.id, actor.adminActorId);
      if (!won) throw new AppError('CONFLICT', 'draft was published or archived elsewhere');

      await moveCurrentPointer(tx, qv.questionnaireId, qv.id);
      return (await getQuestionnaireVersion(tx, qv.id))!;
    });
  },

  async archive(db: Database, actor: Actor, questionnaireVersionId: string) {
    assertAdmin(actor);
    return db.transaction(async (tx) => {
      const qv = await getQuestionnaireVersion(tx, questionnaireVersionId, true);
      if (!qv) throw new AppError('NOT_FOUND', 'questionnaire version not found');
      if (qv.status !== 'PUBLISHED') {
        throw new AppError('CONFLICT', `cannot archive ${qv.status} version`);
      }
      const won = await casArchiveQuestionnaireVersion(tx, qv.id);
      if (!won) throw new AppError('CONFLICT', 'version changed under us');
      await clearPointerIfEquals(tx, qv.questionnaireId, qv.id);
      return (await getQuestionnaireVersion(tx, qv.id))!;
    });
  },
};
