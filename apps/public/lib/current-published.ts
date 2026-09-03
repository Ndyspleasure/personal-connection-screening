import {
  getDb,
  schema,
  sql,
  type Database,
  type PolicyVersion,
  type QuestionnaireVersion,
  type ScoringVersion,
} from '@pcs/db';
import { AppError } from '@pcs/security';

/**
 * Resolve the current published (questionnaire, scoring, policy) trio for
 * NEW sessions (Master §7; Data §10, §46, §93). "Current" is a pointer on
 * the questionnaire row plus the latest PUBLISHED policy version. Attempts
 * always LOCK these ids at creation; this helper is only for NEW starts.
 */
export interface CurrentPublished {
  questionnaireVersion: QuestionnaireVersion;
  scoringVersion: ScoringVersion;
  policyVersion: PolicyVersion;
}

export async function resolveCurrentPublished(db: Database = getDb()): Promise<CurrentPublished> {
  const qnRows = await db
    .select()
    .from(schema.questionnaire)
    .where(sql`current_version_id IS NOT NULL`)
    .limit(1);
  const qn = qnRows[0];
  if (!qn?.currentVersionId) throw new AppError('NOT_FOUND', 'no published questionnaire');

  const qvRows = await db
    .select()
    .from(schema.questionnaireVersion)
    .where(sql`id = ${qn.currentVersionId}`)
    .limit(1);
  const qv = qvRows[0];
  if (!qv || qv.status !== 'PUBLISHED')
    throw new AppError('NOT_FOUND', 'current version not published');
  if (!qv.scoringVersionId)
    throw new AppError('INTEGRITY_ERROR', 'published version missing scoring');

  const svRows = await db
    .select()
    .from(schema.scoringVersion)
    .where(sql`id = ${qv.scoringVersionId}`)
    .limit(1);
  const sv = svRows[0];
  if (!sv || sv.status !== 'PUBLISHED')
    throw new AppError('INTEGRITY_ERROR', 'scoring not published');

  const pvRows = await db
    .select()
    .from(schema.policyVersion)
    .where(sql`status = 'PUBLISHED'`)
    .orderBy(sql`version_number desc`)
    .limit(1);
  const pv = pvRows[0];
  if (!pv) throw new AppError('NOT_FOUND', 'no published policy');

  return { questionnaireVersion: qv, scoringVersion: sv, policyVersion: pv };
}
