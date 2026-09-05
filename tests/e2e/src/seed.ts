import { policyService, questionnaireService, scoringService, type AdminActor } from '@pcs/domain';
import type { Database } from '@pcs/db';

const ADMIN: AdminActor = { type: 'ADMIN', adminActorId: 'e2e-admin', role: 'OWNER' };

export interface SeededScreening {
  slug: string;
  questionnaireId: string;
  questionnaireVersionId: string;
  passingScore: number;
}

/**
 * Publish a minimal but complete screening: two required boolean questions,
 * scoring that awards 40 points per "yes" (both yes => 80 >= passing 70 =>
 * PASS), and a published policy. Because the E2E runs against a freshly
 * migrated, empty database, this becomes THE current published screening, so
 * the public app's `resolveCurrentPublished()` deterministically resolves it.
 */
export async function seedPublishedScreening(
  db: Database,
  passingScore = 70,
): Promise<SeededScreening> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const scoringConfig = await scoringService.createConfiguration(db, ADMIN, `e2e-sc-${suffix}`);
  const policyConfig = await policyService.createConfiguration(db, ADMIN, {
    name: `e2e-pc-${suffix}`,
  });
  const qn = await questionnaireService.createQuestionnaire(db, ADMIN, {
    slug: `e2e-screening-${suffix}`,
    name: `E2E Screening ${suffix}`,
  });
  const draft = await questionnaireService.createDraftVersion(db, ADMIN, {
    questionnaireId: qn.id,
  });
  const q1 = await questionnaireService.addQuestion(db, ADMIN, {
    questionnaireVersionId: draft.id,
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
  const q2 = await questionnaireService.addQuestion(db, ADMIN, {
    questionnaireVersionId: draft.id,
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
  const scoringDraft = await scoringService.draft(db, ADMIN, {
    scoringConfigurationId: scoringConfig.id,
    passingScore,
    rules: [
      { optionVersionId: q1.optionVersionIds[0]!, points: 40 },
      { optionVersionId: q2.optionVersionIds[0]!, points: 40 },
    ],
  });
  const publishedScoring = await scoringService.publish(db, ADMIN, scoringDraft.id);
  await questionnaireService.setScoring(db, ADMIN, {
    questionnaireVersionId: draft.id,
    scoringVersionId: publishedScoring.id,
    expectedRevision: 0,
  });
  const publishedQn = await questionnaireService.publish(db, ADMIN, draft.id);
  const policyDraft = await policyService.draft(db, ADMIN, {
    policyConfigurationId: policyConfig.id,
    sessionLifetimeSeconds: 24 * 60 * 60,
    questionnaireTimeLimitSeconds: 30 * 60,
  });
  await policyService.publish(db, ADMIN, policyDraft.id);

  return {
    slug: qn.slug,
    questionnaireId: qn.id,
    questionnaireVersionId: publishedQn.id,
    passingScore,
  };
}
