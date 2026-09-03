import {
  casPublishScoringVersion,
  createScoringConfiguration,
  getScoringVersion,
  insertDraftScoringVersion,
  insertScoringRule,
  nextScoringVersionNumber,
  type Database,
} from '@pcs/db';
import { AppError } from '@pcs/security';
import type { Actor } from '../authz';
import { assertAdmin } from './errors';

/**
 * ScoringService — draft → validate → publish for scoring versions
 * (Master Spec §24.3; Functional Spec §87–89; Technology Architecture §129).
 * Published versions are historically immutable (Data §71, §92; AC VER-06).
 */

export interface CreateScoringInput {
  name: string;
  passingScore: number;
  rules: { optionKey?: string; points: number; weight?: number }[];
}

/** MVP: passing score must be non-negative and finite. */
export function validateScoringDraft(input: {
  passingScore: number;
  rules: { points: number; weight?: number }[];
}): void {
  if (!Number.isFinite(input.passingScore) || input.passingScore < 0) {
    throw new AppError('VALIDATION_ERROR', 'passing_score must be a non-negative finite number');
  }
  if (input.rules.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'scoring version needs at least one rule');
  }
  for (const rule of input.rules) {
    if (!Number.isFinite(rule.points)) {
      throw new AppError('VALIDATION_ERROR', 'rule.points must be finite');
    }
    if (rule.weight !== undefined && (!Number.isFinite(rule.weight) || rule.weight < 0)) {
      throw new AppError('VALIDATION_ERROR', 'rule.weight must be a non-negative finite number');
    }
  }
}

export const scoringService = {
  /** Create a new scoring configuration (identity across versions). */
  async createConfiguration(db: Database, actor: Actor, name: string) {
    assertAdmin(actor);
    return db.transaction(async (tx) => createScoringConfiguration(tx, name));
  },

  /**
   * Draft a scoring version with its rules keyed by option-version id
   * (already-published `answer_option_version` rows).
   */
  async draft(
    db: Database,
    actor: Actor,
    input: {
      scoringConfigurationId: string;
      passingScore: number;
      rules: { optionVersionId: string; points: number; weight?: number }[];
    },
  ) {
    assertAdmin(actor);
    validateScoringDraft(input);
    return db.transaction(async (tx) => {
      const versionNumber = await nextScoringVersionNumber(tx, input.scoringConfigurationId);
      const version = await insertDraftScoringVersion(tx, {
        scoringConfigurationId: input.scoringConfigurationId,
        versionNumber,
        passingScore: input.passingScore,
      });
      for (const rule of input.rules) {
        await insertScoringRule(tx, {
          scoringVersionId: version.id,
          optionVersionId: rule.optionVersionId,
          points: rule.points,
          weight: rule.weight ?? 1,
        });
      }
      return version;
    });
  },

  /** Publish a DRAFT scoring version. Compare-and-swap: concurrent publishes see one winner. */
  async publish(db: Database, actor: Actor, id: string) {
    assertAdmin(actor);
    const won = await db.transaction(async (tx) => {
      const current = await getScoringVersion(tx, id);
      if (!current) throw new AppError('NOT_FOUND', 'scoring version not found');
      if (current.status === 'PUBLISHED') throw new AppError('CONFLICT', 'already published');
      if (current.status !== 'DRAFT')
        throw new AppError('CONFLICT', `cannot publish ${current.status}`);
      return casPublishScoringVersion(tx, id, actor.adminActorId);
    });
    if (!won) throw new AppError('CONFLICT', 'scoring version changed under us');
    return (await getScoringVersion(db, id))!;
  },
};
