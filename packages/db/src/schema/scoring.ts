import { integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { answerOptionVersion, questionVersion } from './questionnaire';

/**
 * Scoring domain (Data & State Model §15–17). Scoring is versioned so historical
 * results never change when current scoring changes (Data §92, §110; AC VER-06).
 * The passing score is part of the frozen evaluation context (Master Spec §23).
 */

export const scoringConfiguration = pgTable('scoring_configuration', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scoringVersion = pgTable(
  'scoring_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scoringConfigurationId: uuid('scoring_configuration_id')
      .notNull()
      .references(() => scoringConfiguration.id),
    versionNumber: integer('version_number').notNull(),
    // MVP: weighted_sum + gte passing rule (Functional Spec §57–59).
    formulaType: text('formula_type').notNull().default('weighted_sum'),
    passingRule: text('passing_rule').notNull().default('gte'),
    passingScore: integer('passing_score').notNull(),
    status: text('status').notNull().default('DRAFT'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: text('published_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUnique: unique('scoring_version_number_unique').on(
      t.scoringConfigurationId,
      t.versionNumber,
    ),
  }),
);

export const scoringRule = pgTable('scoring_rule', {
  id: uuid('id').primaryKey().defaultRandom(),
  scoringVersionId: uuid('scoring_version_id')
    .notNull()
    .references(() => scoringVersion.id),
  // Points are awarded per selected option version (Data §14, §17).
  optionVersionId: uuid('option_version_id').references(() => answerOptionVersion.id),
  questionVersionId: uuid('question_version_id').references(() => questionVersion.id),
  points: integer('points').notNull().default(0),
  weight: integer('weight').notNull().default(1),
  ruleOrder: integer('rule_order').notNull().default(0),
});

export type ScoringVersion = typeof scoringVersion.$inferSelect;
export type ScoringRule = typeof scoringRule.$inferSelect;
