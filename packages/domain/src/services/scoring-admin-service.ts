import type { ResultType } from '@pcs/types';
import type { AdminActor } from '../authz';
import { buildOptionScores, evaluate } from '../evaluation/engine';
import { assertAdmin } from './errors';

/**
 * ScoringAdminService — pre-publish "test evaluation" (Functional §88;
 * Technology Architecture §129). A pure preview: given proposed scoring rules
 * and a sample set of answers, it runs the SAME evaluation engine the server
 * uses at finalize time and returns the score/result, persisting nothing. This
 * lets an owner sanity-check a scoring design before committing it.
 */

export interface PreviewEvaluationInput {
  passingScore: number;
  rules: { optionVersionId: string; points: number; weight?: number }[];
  answers: { questionVersionId: string; selectedOptionVersionIds: string[] }[];
}

export interface PreviewEvaluationOutcome {
  score: number;
  passingScore: number;
  result: ResultType;
}

export const scoringAdminService = {
  previewEvaluation(actor: AdminActor, input: PreviewEvaluationInput): PreviewEvaluationOutcome {
    assertAdmin(actor);
    const optionScores = buildOptionScores(
      input.rules.map((r) => ({
        optionVersionId: r.optionVersionId,
        points: r.points,
        weight: r.weight ?? 1,
      })),
    );
    const outcome = evaluate(
      input.answers.map((a) => ({
        questionVersionId: a.questionVersionId,
        selectedOptionVersionIds: a.selectedOptionVersionIds,
      })),
      {
        scoringVersionId: 'preview',
        passingScore: input.passingScore,
        passingRule: 'gte',
        formulaType: 'weighted_sum',
        optionScores,
      },
    );
    return { score: outcome.score, passingScore: outcome.passingScore, result: outcome.result };
  },
};
