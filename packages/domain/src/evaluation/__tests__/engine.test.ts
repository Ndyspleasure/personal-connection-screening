import { describe, expect, it } from 'vitest';
import { AppError } from '@pcs/security';
import { buildOptionScores, evaluate, type EvaluationAnswer, type ScoringContext } from '../engine';

function context(
  passingScore: number,
  optionPoints: Record<string, number>,
  weights: Record<string, number> = {},
): ScoringContext {
  const optionScores = new Map(
    Object.entries(optionPoints).map(([id, points]) => [id, { points, weight: weights[id] ?? 1 }]),
  );
  return {
    scoringVersionId: 'sv_test',
    passingScore,
    passingRule: 'gte',
    formulaType: 'weighted_sum',
    optionScores,
  };
}

describe('evaluation engine', () => {
  it('sums selected option points and returns PASS at/above the passing score', () => {
    const ctx = context(70, { yes: 40, maybe: 20, extra: 30 });
    const answers = [
      { questionVersionId: 'q1', selectedOptionVersionIds: ['yes'] },
      { questionVersionId: 'q2', selectedOptionVersionIds: ['extra'] },
    ];
    expect(evaluate(answers, ctx)).toEqual({ score: 70, passingScore: 70, result: 'PASS' });
  });

  it('treats the passing boundary as inclusive (score == passing ⇒ PASS)', () => {
    const ctx = context(70, { a: 70 });
    expect(
      evaluate([{ questionVersionId: 'q', selectedOptionVersionIds: ['a'] }], ctx).result,
    ).toBe('PASS');
  });

  it('returns FAIL below the passing score', () => {
    const ctx = context(70, { a: 69 });
    expect(
      evaluate([{ questionVersionId: 'q', selectedOptionVersionIds: ['a'] }], ctx).result,
    ).toBe('FAIL');
  });

  it('sums multiple selected options (multiple_choice)', () => {
    const ctx = context(50, { a: 20, b: 15, c: 25 });
    const answers = [{ questionVersionId: 'q', selectedOptionVersionIds: ['a', 'b', 'c'] }];
    expect(evaluate(answers, ctx).score).toBe(60);
  });

  it('applies per-option weight', () => {
    const ctx = context(100, { a: 10 }, { a: 5 });
    expect(evaluate([{ questionVersionId: 'q', selectedOptionVersionIds: ['a'] }], ctx).score).toBe(
      50,
    );
  });

  it('ignores options with no scoring rule (contributes 0)', () => {
    const ctx = context(10, { known: 5 });
    const answers = [{ questionVersionId: 'q', selectedOptionVersionIds: ['known', 'unknown'] }];
    expect(evaluate(answers, ctx).score).toBe(5);
  });

  it('is deterministic: identical inputs yield identical outcomes', () => {
    const ctx = context(30, { a: 15, b: 15 });
    const answers = [{ questionVersionId: 'q', selectedOptionVersionIds: ['a', 'b'] }];
    expect(evaluate(answers, ctx)).toEqual(evaluate(answers, ctx));
  });

  it('different scoring versions produce different results for the same answers (Data §110)', () => {
    const answers = [{ questionVersionId: 'q', selectedOptionVersionIds: ['yes'] }];
    const v3 = context(70, { yes: 100 }); // YES = +100
    const v4 = context(70, { yes: 50 }); // YES = +50
    expect(evaluate(answers, v3).result).toBe('PASS');
    expect(evaluate(answers, v4).result).toBe('FAIL');
  });

  it('never trusts a client-provided score: only server option scores count', () => {
    const ctx = context(70, { real: 10 });
    // Simulate a malicious client payload carrying extra score/result fields; the
    // engine only reads selected option ids, so the injected values are ignored.
    const rawFromClient = {
      questionVersionId: 'q',
      selectedOptionVersionIds: ['real'],
      score: 999,
      result: 'PASS',
    };
    const outcome = evaluate([rawFromClient as unknown as EvaluationAnswer], ctx);
    expect(outcome).toEqual({ score: 10, passingScore: 70, result: 'FAIL' });
  });

  it('raises EVALUATION_ERROR (not FAIL) when the context is invalid', () => {
    const ctx = context(Number.NaN, { a: 10 });
    expect(() =>
      evaluate([{ questionVersionId: 'q', selectedOptionVersionIds: ['a'] }], ctx),
    ).toThrow(AppError);
  });
});

describe('buildOptionScores', () => {
  it('maps option scoring rules and drops null-option rules', () => {
    const map = buildOptionScores([
      { optionVersionId: 'a', points: 10, weight: 2 },
      { optionVersionId: null, points: 5, weight: 1 },
    ]);
    expect(map.get('a')).toEqual({ points: 10, weight: 2 });
    expect(map.size).toBe(1);
  });
});
