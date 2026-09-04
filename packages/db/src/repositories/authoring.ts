import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client';
import {
  answerOption,
  answerOptionVersion,
  policyConfiguration,
  policyVersion,
  question,
  questionnaire,
  questionnaireVersion,
  questionnaireVersionQuestion,
  questionVersion,
  scoringConfiguration,
  scoringRule,
  scoringVersion,
} from '../schema/index';

/**
 * Authoring / publish data access (Data & State Model §85; Technology
 * Architecture §28, §104). Granular helpers that accept either the base
 * connection or a transaction, so a service can compose an atomic publish
 * workflow (validate → freeze → publish → move pointer) in one transaction.
 * Concurrency-critical writes are compare-and-swap on `status`/`revision`.
 */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbExecutor = Database | Tx;

// --- scoring -----------------------------------------------------------------
export async function createScoringConfiguration(exec: DbExecutor, name: string) {
  const rows = await exec.insert(scoringConfiguration).values({ name }).returning();
  return rows[0]!;
}

export async function nextScoringVersionNumber(
  exec: DbExecutor,
  configId: string,
): Promise<number> {
  const rows = await exec
    .select({ n: sql<number>`coalesce(max(${scoringVersion.versionNumber}), 0)` })
    .from(scoringVersion)
    .where(eq(scoringVersion.scoringConfigurationId, configId));
  return Number(rows[0]?.n ?? 0) + 1;
}

export async function insertDraftScoringVersion(
  exec: DbExecutor,
  input: {
    scoringConfigurationId: string;
    versionNumber: number;
    passingScore: number;
    formulaType?: string;
    passingRule?: string;
  },
) {
  const rows = await exec
    .insert(scoringVersion)
    .values({
      scoringConfigurationId: input.scoringConfigurationId,
      versionNumber: input.versionNumber,
      passingScore: input.passingScore,
      formulaType: input.formulaType ?? 'weighted_sum',
      passingRule: input.passingRule ?? 'gte',
      status: 'DRAFT',
    })
    .returning();
  return rows[0]!;
}

export async function insertScoringRule(
  exec: DbExecutor,
  input: {
    scoringVersionId: string;
    optionVersionId?: string | null;
    questionVersionId?: string | null;
    points: number;
    weight?: number;
  },
) {
  const rows = await exec
    .insert(scoringRule)
    .values({
      scoringVersionId: input.scoringVersionId,
      optionVersionId: input.optionVersionId ?? null,
      questionVersionId: input.questionVersionId ?? null,
      points: input.points,
      weight: input.weight ?? 1,
    })
    .returning();
  return rows[0]!;
}

export async function getScoringVersion(exec: DbExecutor, id: string) {
  const rows = await exec.select().from(scoringVersion).where(eq(scoringVersion.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listScoringRules(exec: DbExecutor, scoringVersionId: string) {
  return exec.select().from(scoringRule).where(eq(scoringRule.scoringVersionId, scoringVersionId));
}

export async function casPublishScoringVersion(
  exec: DbExecutor,
  id: string,
  publishedBy: string,
): Promise<boolean> {
  const rows = await exec
    .update(scoringVersion)
    .set({ status: 'PUBLISHED', publishedAt: sql`now()`, publishedBy })
    .where(and(eq(scoringVersion.id, id), eq(scoringVersion.status, 'DRAFT')))
    .returning({ id: scoringVersion.id });
  return rows.length > 0;
}

// --- policy ------------------------------------------------------------------
export async function createPolicyConfiguration(
  exec: DbExecutor,
  input: { name: string; policyType?: string },
) {
  const rows = await exec
    .insert(policyConfiguration)
    .values({ name: input.name, policyType: input.policyType ?? 'session' })
    .returning();
  return rows[0]!;
}

export async function nextPolicyVersionNumber(exec: DbExecutor, configId: string): Promise<number> {
  const rows = await exec
    .select({ n: sql<number>`coalesce(max(${policyVersion.versionNumber}), 0)` })
    .from(policyVersion)
    .where(eq(policyVersion.policyConfigurationId, configId));
  return Number(rows[0]?.n ?? 0) + 1;
}

export async function insertDraftPolicyVersion(
  exec: DbExecutor,
  input: {
    policyConfigurationId: string;
    versionNumber: number;
    sessionLifetimeSeconds: number;
    questionnaireTimeLimitSeconds?: number | null;
    allowResume?: boolean;
    allowMultiDevice?: boolean;
    retakeMode?: string;
    maxAttempts?: number;
    cooldownSeconds?: number;
  },
) {
  const rows = await exec
    .insert(policyVersion)
    .values({
      policyConfigurationId: input.policyConfigurationId,
      versionNumber: input.versionNumber,
      sessionLifetimeSeconds: input.sessionLifetimeSeconds,
      questionnaireTimeLimitSeconds: input.questionnaireTimeLimitSeconds ?? null,
      allowResume: input.allowResume ?? true,
      allowMultiDevice: input.allowMultiDevice ?? true,
      retakeMode: input.retakeMode ?? 'ON_NEW_VERSION',
      maxAttempts: input.maxAttempts ?? 3,
      cooldownSeconds: input.cooldownSeconds ?? 0,
      status: 'DRAFT',
    })
    .returning();
  return rows[0]!;
}

export async function getPolicyVersion(exec: DbExecutor, id: string) {
  const rows = await exec.select().from(policyVersion).where(eq(policyVersion.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function casPublishPolicyVersion(
  exec: DbExecutor,
  id: string,
  publishedBy: string,
): Promise<boolean> {
  const rows = await exec
    .update(policyVersion)
    .set({ status: 'PUBLISHED', effectiveAt: sql`now()`, publishedBy })
    .where(and(eq(policyVersion.id, id), eq(policyVersion.status, 'DRAFT')))
    .returning({ id: policyVersion.id });
  return rows.length > 0;
}

export async function getLatestPublishedPolicyVersion(exec: DbExecutor, configId: string) {
  const rows = await exec
    .select()
    .from(policyVersion)
    .where(
      and(eq(policyVersion.policyConfigurationId, configId), eq(policyVersion.status, 'PUBLISHED')),
    )
    .orderBy(sql`${policyVersion.versionNumber} desc`)
    .limit(1);
  return rows[0] ?? null;
}

// --- questionnaire -----------------------------------------------------------
export async function createQuestionnaire(exec: DbExecutor, input: { slug: string; name: string }) {
  const rows = await exec
    .insert(questionnaire)
    .values({ slug: input.slug, name: input.name })
    .returning();
  return rows[0]!;
}

export async function getQuestionnaire(exec: DbExecutor, id: string) {
  const rows = await exec.select().from(questionnaire).where(eq(questionnaire.id, id)).limit(1);
  return rows[0] ?? null;
}

/** All questionnaires (admin authoring list), newest first. */
export async function listQuestionnaires(exec: DbExecutor) {
  return exec.select().from(questionnaire).orderBy(desc(questionnaire.createdAt));
}

/** All versions of one questionnaire, newest version first (admin list). */
export async function listQuestionnaireVersionsByQuestionnaire(
  exec: DbExecutor,
  questionnaireId: string,
) {
  return exec
    .select()
    .from(questionnaireVersion)
    .where(eq(questionnaireVersion.questionnaireId, questionnaireId))
    .orderBy(desc(questionnaireVersion.versionNumber));
}

export async function nextQuestionnaireVersionNumber(
  exec: DbExecutor,
  questionnaireId: string,
): Promise<number> {
  const rows = await exec
    .select({ n: sql<number>`coalesce(max(${questionnaireVersion.versionNumber}), 0)` })
    .from(questionnaireVersion)
    .where(eq(questionnaireVersion.questionnaireId, questionnaireId));
  return Number(rows[0]?.n ?? 0) + 1;
}

export async function insertDraftQuestionnaireVersion(
  exec: DbExecutor,
  input: { questionnaireId: string; versionNumber: number; scoringVersionId?: string | null },
) {
  const rows = await exec
    .insert(questionnaireVersion)
    .values({
      questionnaireId: input.questionnaireId,
      versionNumber: input.versionNumber,
      scoringVersionId: input.scoringVersionId ?? null,
      status: 'DRAFT',
    })
    .returning();
  return rows[0]!;
}

export async function getQuestionnaireVersion(exec: DbExecutor, id: string, forUpdate = false) {
  const base = exec
    .select()
    .from(questionnaireVersion)
    .where(eq(questionnaireVersion.id, id))
    .limit(1);
  const rows = await (forUpdate ? base.for('update') : base);
  return rows[0] ?? null;
}

/** Optimistic-concurrency draft edit: only succeeds at the expected revision. */
export async function casUpdateQuestionnaireVersionScoring(
  exec: DbExecutor,
  input: { id: string; expectedRevision: number; scoringVersionId: string | null },
): Promise<boolean> {
  const rows = await exec
    .update(questionnaireVersion)
    .set({
      scoringVersionId: input.scoringVersionId,
      revision: sql`${questionnaireVersion.revision} + 1`,
    })
    .where(
      and(
        eq(questionnaireVersion.id, input.id),
        eq(questionnaireVersion.status, 'DRAFT'),
        eq(questionnaireVersion.revision, input.expectedRevision),
      ),
    )
    .returning({ id: questionnaireVersion.id });
  return rows.length > 0;
}

export async function createQuestionWithVersionAndOptions(
  exec: DbExecutor,
  input: {
    stableKey: string;
    type: string;
    text: string;
    description?: string | null;
    required?: boolean;
    options?: { value: string; label: string }[];
  },
): Promise<{ questionId: string; questionVersionId: string; optionVersionIds: string[] }> {
  const q = (await exec.insert(question).values({ stableKey: input.stableKey }).returning())[0]!;
  const qv = (
    await exec
      .insert(questionVersion)
      .values({
        questionId: q.id,
        versionNumber: 1,
        type: input.type,
        text: input.text,
        description: input.description ?? null,
        required: input.required ?? false,
        status: 'DRAFT',
      })
      .returning()
  )[0]!;
  const optionVersionIds: string[] = [];
  let position = 0;
  for (const opt of input.options ?? []) {
    const ao = (
      await exec
        .insert(answerOption)
        .values({ stableKey: `${input.stableKey}:${opt.value}` })
        .returning()
    )[0]!;
    const aov = (
      await exec
        .insert(answerOptionVersion)
        .values({
          optionId: ao.id,
          questionVersionId: qv.id,
          value: opt.value,
          label: opt.label,
          position: position++,
        })
        .returning()
    )[0]!;
    optionVersionIds.push(aov.id);
  }
  return { questionId: q.id, questionVersionId: qv.id, optionVersionIds };
}

export async function bindQuestionVersion(
  exec: DbExecutor,
  input: { questionnaireVersionId: string; questionVersionId: string; position: number },
) {
  const rows = await exec
    .insert(questionnaireVersionQuestion)
    .values({
      questionnaireVersionId: input.questionnaireVersionId,
      questionVersionId: input.questionVersionId,
      position: input.position,
    })
    .returning();
  return rows[0]!;
}

export async function listBindings(exec: DbExecutor, questionnaireVersionId: string) {
  return exec
    .select()
    .from(questionnaireVersionQuestion)
    .where(eq(questionnaireVersionQuestion.questionnaireVersionId, questionnaireVersionId))
    .orderBy(asc(questionnaireVersionQuestion.position));
}

export async function getQuestionVersionsByIds(exec: DbExecutor, ids: string[]) {
  if (ids.length === 0) return [];
  return exec.select().from(questionVersion).where(inArray(questionVersion.id, ids));
}

export async function listOptionsByQuestionVersionIds(exec: DbExecutor, ids: string[]) {
  if (ids.length === 0) return [];
  return exec
    .select()
    .from(answerOptionVersion)
    .where(inArray(answerOptionVersion.questionVersionId, ids))
    .orderBy(asc(answerOptionVersion.position));
}

export async function freezeQuestionVersions(exec: DbExecutor, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await exec
    .update(questionVersion)
    .set({ status: 'PUBLISHED', publishedAt: sql`now()` })
    .where(and(inArray(questionVersion.id, ids), eq(questionVersion.status, 'DRAFT')));
}

export async function casPublishQuestionnaireVersion(
  exec: DbExecutor,
  id: string,
  publishedBy: string,
): Promise<boolean> {
  const rows = await exec
    .update(questionnaireVersion)
    .set({ status: 'PUBLISHED', publishedAt: sql`now()`, publishedBy })
    .where(and(eq(questionnaireVersion.id, id), eq(questionnaireVersion.status, 'DRAFT')))
    .returning({ id: questionnaireVersion.id });
  return rows.length > 0;
}

export async function moveCurrentPointer(
  exec: DbExecutor,
  questionnaireId: string,
  versionId: string,
): Promise<void> {
  await exec
    .update(questionnaire)
    .set({ currentVersionId: versionId, updatedAt: sql`now()` })
    .where(eq(questionnaire.id, questionnaireId));
}

export async function casArchiveQuestionnaireVersion(
  exec: DbExecutor,
  id: string,
): Promise<boolean> {
  const rows = await exec
    .update(questionnaireVersion)
    .set({ status: 'ARCHIVED' })
    .where(and(eq(questionnaireVersion.id, id), eq(questionnaireVersion.status, 'PUBLISHED')))
    .returning({ id: questionnaireVersion.id });
  return rows.length > 0;
}

export async function clearPointerIfEquals(
  exec: DbExecutor,
  questionnaireId: string,
  versionId: string,
): Promise<void> {
  await exec
    .update(questionnaire)
    .set({ currentVersionId: null, updatedAt: sql`now()` })
    .where(
      and(eq(questionnaire.id, questionnaireId), eq(questionnaire.currentVersionId, versionId)),
    );
}
