import { describe, expect, it } from 'vitest';
import type { AdminActor, CandidateActor } from '../../authz';
import { scoringAdminService } from '../scoring-admin-service';

/** Test-evaluation preview is pure — no DB, so this is a unit test. */
const admin: AdminActor = { type: 'ADMIN', adminActorId: 'a', role: 'OWNER' };
const notAdmin: CandidateActor = { type: 'PUBLIC_CANDIDATE', sessionRef: 's', attemptId: 'x' };

const rules = [
  { optionVersionId: 'optA', points: 40 },
  { optionVersionId: 'optB', points: 40 },
];

describe('scoringAdminService.previewEvaluation', () => {
  it('rejects a non-admin', () => {
    expect(() =>
      // @ts-expect-error candidate where admin required
      scoringAdminService.previewEvaluation(notAdmin, { passingScore: 1, rules, answers: [] }),
    ).toThrow();
  });

  it('sums selected option points and applies gte passing rule', () => {
    const pass = scoringAdminService.previewEvaluation(admin, {
      passingScore: 70,
      rules,
      answers: [
        { questionVersionId: 'q1', selectedOptionVersionIds: ['optA'] },
        { questionVersionId: 'q2', selectedOptionVersionIds: ['optB'] },
      ],
    });
    expect(pass.score).toBe(80);
    expect(pass.result).toBe('PASS');

    const fail = scoringAdminService.previewEvaluation(admin, {
      passingScore: 70,
      rules,
      answers: [{ questionVersionId: 'q1', selectedOptionVersionIds: ['optA'] }],
    });
    expect(fail.score).toBe(40);
    expect(fail.result).toBe('FAIL');
  });

  it('ignores option ids that carry no rule', () => {
    const out = scoringAdminService.previewEvaluation(admin, {
      passingScore: 1,
      rules,
      answers: [{ questionVersionId: 'q1', selectedOptionVersionIds: ['unknown'] }],
    });
    expect(out.score).toBe(0);
    expect(out.result).toBe('FAIL');
  });

  it('applies weight when provided (weighted_sum)', () => {
    const out = scoringAdminService.previewEvaluation(admin, {
      passingScore: 100,
      rules: [{ optionVersionId: 'optA', points: 40, weight: 3 }],
      answers: [{ questionVersionId: 'q1', selectedOptionVersionIds: ['optA'] }],
    });
    expect(out.score).toBe(120);
    expect(out.result).toBe('PASS');
  });
});
