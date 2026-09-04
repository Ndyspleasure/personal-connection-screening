export { getDb, closeDb, type Database } from './client';
export { sql, eq, and, or, inArray } from 'drizzle-orm';
export * as schema from './schema/index';
export * from './repositories/content';
export * from './repositories/authoring';
export type { Profile, ContentSection } from './schema/content';
export type {
  Questionnaire,
  QuestionnaireVersion,
  Question,
  QuestionVersion,
  AnswerOptionVersion,
  QuestionnaireVersionQuestion,
} from './schema/questionnaire';
export type { ScoringVersion, ScoringRule } from './schema/scoring';
export type { PolicyVersion } from './schema/policy';
export type {
  CandidateContext,
  Attempt,
  Session,
  Answer,
  AttemptPolicySnapshot,
} from './schema/execution';
export type { Submission, Evaluation, Result, Verification } from './schema/finalization';
export * from './repositories/execution';
export * from './repositories/answers';
export * from './repositories/finalization';
export * from './repositories/governance';
export * from './repositories/content-admin';
export type { AdminActorRecord, AuditEventRecord } from './schema/governance';
