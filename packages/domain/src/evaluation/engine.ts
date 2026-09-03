import { AppError } from '@pcs/security';
import type { ResultType } from '@pcs/types';

/**
 * Evaluation engine (Functional Spec §56–60; Technology Architecture §25–26).
 *
 * A pure, deterministic function: given identical answers + scoring context it
 * always yields the same result. It depends only on trusted server state — never
 * on any client-provided score/result (Master Spec §2.1; Threat TH-013/014;
 * AC SEC-AC-01). If a valid result cannot be computed it raises EVALUATION_ERROR
 * rather than inventing PASS/FAIL (Functional Spec §60).
 */

export interface OptionScore {
  points: number;
  weight: number;
}

export interface ScoringContext {
  scoringVersionId: string;
  passingScore: number;
  /** MVP supports 'gte': score >= passingScore ⇒ PASS (boundary inclusive). */
  passingRule: 'gte';
  formulaType: 'weighted_sum';
  /** option_version_id → its points/weight in this scoring version. */
  optionScores: ReadonlyMap<string, OptionScore>;
}

export interface EvaluationAnswer {
  questionVersionId: string;
  /** Selected options for single_choice / multiple_choice / boolean. */
  selectedOptionVersionIds: readonly string[];
  numericValue?: number | null;
  textValue?: string | null;
}

export interface EvaluationOutcome {
  score: number;
  passingScore: number;
  result: ResultType;
}

export function evaluate(
  answers: readonly EvaluationAnswer[],
  context: ScoringContext,
): EvaluationOutcome {
  if (!Number.isFinite(context.passingScore)) {
    throw new AppError('EVALUATION_ERROR', 'passing score is not finite');
  }
  if (context.formulaType !== 'weighted_sum' || context.passingRule !== 'gte') {
    throw new AppError(
      'EVALUATION_ERROR',
      `unsupported scoring formula/rule for ${context.scoringVersionId}`,
    );
  }

  let score = 0;
  for (const answer of answers) {
    for (const optionVersionId of answer.selectedOptionVersionIds) {
      const rule = context.optionScores.get(optionVersionId);
      if (rule) {
        score += rule.points * rule.weight;
      }
    }
  }

  if (!Number.isFinite(score)) {
    throw new AppError('EVALUATION_ERROR', 'computed score is not finite');
  }

  const result: ResultType = score >= context.passingScore ? 'PASS' : 'FAIL';
  return { score, passingScore: context.passingScore, result };
}

/** Build a scoring context's option-score map from raw scoring-rule rows. */
export function buildOptionScores(
  rules: readonly { optionVersionId: string | null; points: number; weight: number }[],
): Map<string, OptionScore> {
  const map = new Map<string, OptionScore>();
  for (const rule of rules) {
    if (rule.optionVersionId) {
      map.set(rule.optionVersionId, { points: rule.points, weight: rule.weight });
    }
  }
  return map;
}
