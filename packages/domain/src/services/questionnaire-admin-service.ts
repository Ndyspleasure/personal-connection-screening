import {
  getQuestionnaire,
  getQuestionnaireVersion,
  getQuestionVersionsByIds,
  getScoringVersion,
  listBindings,
  listOptionsByQuestionVersionIds,
  listQuestionnaires,
  listQuestionnaireVersionsByQuestionnaire,
  type Database,
} from '@pcs/db';
import { AppError } from '@pcs/security';
import type { AdminActor } from '../authz';
import { assertAdmin } from './errors';
import { auditService } from './audit-service';
import type { MutationContext } from './content-admin-service';
import { questionnaireService } from './questionnaire-service';
import { scoringService } from './scoring-service';

/**
 * QuestionnaireAdminService — the read model + audited orchestration behind the
 * CMS questionnaire builder (Functional §81–86, §110). Structural mutation and
 * the atomic publish pipeline live in QuestionnaireService/ScoringService (fully
 * integration-tested); this layer adds the authoring views, sequences the
 * publish-with-scoring flow the UI needs, and writes the audit trail.
 */

export interface QuestionnaireListItem {
  id: string;
  slug: string;
  name: string;
  currentVersionId: string | null;
  versions: {
    id: string;
    versionNumber: number;
    status: string;
    scoringVersionId: string | null;
    isCurrent: boolean;
  }[];
}

export interface VersionQuestionView {
  questionVersionId: string;
  position: number;
  type: string;
  text: string;
  description: string | null;
  required: boolean;
  options: { id: string; value: string; label: string }[];
}

export interface VersionDetail {
  id: string;
  questionnaireId: string;
  versionNumber: number;
  status: string;
  revision: number;
  scoringVersionId: string | null;
  isCurrent: boolean;
  questions: VersionQuestionView[];
  scoring: { id: string; status: string; passingScore: number } | null;
}

async function loadVersionDetail(db: Database, versionId: string): Promise<VersionDetail> {
  const version = await getQuestionnaireVersion(db, versionId);
  if (!version) throw new AppError('NOT_FOUND', 'questionnaire version not found');
  const parent = await getQuestionnaire(db, version.questionnaireId);

  const bindings = await listBindings(db, versionId);
  const qvIds = bindings.map((b) => b.questionVersionId);
  const [questionVersions, options] = await Promise.all([
    getQuestionVersionsByIds(db, qvIds),
    listOptionsByQuestionVersionIds(db, qvIds),
  ]);
  const qvById = new Map(questionVersions.map((q) => [q.id, q]));
  const optsByQv = new Map<string, { id: string; value: string; label: string }[]>();
  for (const o of options) {
    const list = optsByQv.get(o.questionVersionId) ?? [];
    list.push({ id: o.id, value: o.value, label: o.label });
    optsByQv.set(o.questionVersionId, list);
  }

  const questions: VersionQuestionView[] = bindings.map((b) => {
    const qv = qvById.get(b.questionVersionId);
    return {
      questionVersionId: b.questionVersionId,
      position: b.position,
      type: qv?.type ?? 'unknown',
      text: qv?.text ?? '',
      description: qv?.description ?? null,
      required: qv?.required ?? false,
      options: optsByQv.get(b.questionVersionId) ?? [],
    };
  });

  let scoring: VersionDetail['scoring'] = null;
  if (version.scoringVersionId) {
    const sv = await getScoringVersion(db, version.scoringVersionId);
    if (sv) scoring = { id: sv.id, status: sv.status, passingScore: sv.passingScore };
  }

  return {
    id: version.id,
    questionnaireId: version.questionnaireId,
    versionNumber: version.versionNumber,
    status: version.status,
    revision: version.revision,
    scoringVersionId: version.scoringVersionId,
    isCurrent: parent?.currentVersionId === version.id,
    questions,
    scoring,
  };
}

export const questionnaireAdminService = {
  async list(db: Database, actor: AdminActor): Promise<QuestionnaireListItem[]> {
    assertAdmin(actor);
    const questionnaires = await listQuestionnaires(db);
    const out: QuestionnaireListItem[] = [];
    for (const q of questionnaires) {
      const versions = await listQuestionnaireVersionsByQuestionnaire(db, q.id);
      out.push({
        id: q.id,
        slug: q.slug,
        name: q.name,
        currentVersionId: q.currentVersionId,
        versions: versions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          status: v.status,
          scoringVersionId: v.scoringVersionId,
          isCurrent: q.currentVersionId === v.id,
        })),
      });
    }
    return out;
  },

  async getVersionDetail(
    db: Database,
    actor: AdminActor,
    versionId: string,
  ): Promise<VersionDetail> {
    assertAdmin(actor);
    return loadVersionDetail(db, versionId);
  },

  async createQuestionnaire(
    db: Database,
    actor: AdminActor,
    input: { slug: string; name: string },
    ctx: MutationContext,
  ) {
    assertAdmin(actor);
    const created = await questionnaireService.createQuestionnaire(db, actor, input);
    const draft = await questionnaireService.createDraftVersion(db, actor, {
      questionnaireId: created.id,
    });
    await auditService.record(
      db,
      { correlationId: ctx.correlationId, actor },
      {
        action: 'questionnaire.created',
        entityType: 'questionnaire',
        entityId: created.id,
        summary: `questionnaire "${created.slug}" created with draft v${draft.versionNumber}`,
        metadata: { draftVersionId: draft.id },
      },
    );
    return { questionnaire: created, draftVersion: draft };
  },

  async createDraftVersion(
    db: Database,
    actor: AdminActor,
    input: { questionnaireId: string },
    ctx: MutationContext,
  ) {
    assertAdmin(actor);
    const draft = await questionnaireService.createDraftVersion(db, actor, input);
    await auditService.record(
      db,
      { correlationId: ctx.correlationId, actor },
      {
        action: 'questionnaire.version.drafted',
        entityType: 'questionnaire_version',
        entityId: draft.id,
        summary: `draft v${draft.versionNumber} created`,
      },
    );
    return draft;
  },

  async addQuestion(
    db: Database,
    actor: AdminActor,
    versionId: string,
    input: {
      type: string;
      text: string;
      description?: string | null;
      required?: boolean;
      options?: { value: string; label: string }[];
    },
    ctx: MutationContext,
  ) {
    assertAdmin(actor);
    // Position is server-assigned to the end so the client never manages it.
    const existing = await listBindings(db, versionId);
    const stableKey = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const created = await questionnaireService.addQuestion(db, actor, {
      questionnaireVersionId: versionId,
      stableKey,
      type: input.type,
      text: input.text,
      description: input.description ?? null,
      required: input.required ?? false,
      options: input.options ?? [],
      position: existing.length,
    });
    await auditService.record(
      db,
      { correlationId: ctx.correlationId, actor },
      {
        action: 'questionnaire.question.added',
        entityType: 'questionnaire_version',
        entityId: versionId,
        summary: `added ${input.type} question`,
        metadata: { questionVersionId: created.questionVersionId },
      },
    );
    return created;
  },

  /**
   * Publish a DRAFT version together with its scoring in one admin action:
   * create + publish a scoring version from the supplied rules, attach it, then
   * run the atomic questionnaire publish (which re-validates everything).
   */
  async publishWithScoring(
    db: Database,
    actor: AdminActor,
    versionId: string,
    input: { passingScore: number; rules: { optionVersionId: string; points: number }[] },
    ctx: MutationContext,
  ) {
    assertAdmin(actor);
    const version = await getQuestionnaireVersion(db, versionId);
    if (!version) throw new AppError('NOT_FOUND', 'questionnaire version not found');
    if (version.status !== 'DRAFT') {
      throw new AppError('CONFLICT', `cannot publish a ${version.status} version`);
    }
    const parent = await getQuestionnaire(db, version.questionnaireId);

    const config = await scoringService.createConfiguration(
      db,
      actor,
      `${parent?.slug ?? 'qnr'}-v${version.versionNumber}-scoring`,
    );
    const scoringDraft = await scoringService.draft(db, actor, {
      scoringConfigurationId: config.id,
      passingScore: input.passingScore,
      rules: input.rules,
    });
    const publishedScoring = await scoringService.publish(db, actor, scoringDraft.id);

    // Re-read the revision right before the CAS so retries after a partial
    // failure still line up (setScoring bumps the revision).
    const fresh = await getQuestionnaireVersion(db, versionId);
    await questionnaireService.setScoring(db, actor, {
      questionnaireVersionId: versionId,
      scoringVersionId: publishedScoring.id,
      expectedRevision: fresh!.revision,
    });
    const published = await questionnaireService.publish(db, actor, versionId);

    await auditService.record(
      db,
      { correlationId: ctx.correlationId, actor },
      {
        action: 'questionnaire.published',
        entityType: 'questionnaire_version',
        entityId: versionId,
        summary: `published v${published.versionNumber}`,
        metadata: { scoringVersionId: publishedScoring.id, passingScore: input.passingScore },
      },
    );
    return published;
  },

  async archive(db: Database, actor: AdminActor, versionId: string, ctx: MutationContext) {
    assertAdmin(actor);
    const archived = await questionnaireService.archive(db, actor, versionId);
    await auditService.record(
      db,
      { correlationId: ctx.correlationId, actor },
      {
        action: 'questionnaire.archived',
        entityType: 'questionnaire_version',
        entityId: versionId,
        summary: `archived v${archived.versionNumber}`,
      },
    );
    return archived;
  },
};
