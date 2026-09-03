import { boolean, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Policy domain (Data & State Model §18–20, §93). Policy is versioned and
 * snapshotted onto each attempt so historical behavior never depends on current
 * CMS settings (Data §20, §46). Field defaults encode the confirmed MVP product
 * decisions (absolute timer, retake ON_NEW_VERSION, max 3 attempts, no cooldown,
 * multi-device allowed).
 */

export const policyConfiguration = pgTable('policy_configuration', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyType: text('policy_type').notNull().default('session'),
  name: text('name').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const policyVersion = pgTable(
  'policy_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    policyConfigurationId: uuid('policy_configuration_id')
      .notNull()
      .references(() => policyConfiguration.id),
    versionNumber: integer('version_number').notNull(),
    sessionLifetimeSeconds: integer('session_lifetime_seconds').notNull().default(86400),
    questionnaireTimeLimitSeconds: integer('questionnaire_time_limit_seconds').default(1800),
    // 'absolute' timer (confirmed decision).
    timerMode: text('timer_mode').notNull().default('absolute'),
    allowResume: boolean('allow_resume').notNull().default(true),
    allowMultiDevice: boolean('allow_multi_device').notNull().default(true),
    // NEVER | ON_NEW_VERSION | AFTER_COOLDOWN | ADMIN_APPROVAL | UNLIMITED
    retakeMode: text('retake_mode').notNull().default('ON_NEW_VERSION'),
    maxAttempts: integer('max_attempts').notNull().default(3),
    cooldownSeconds: integer('cooldown_seconds').notNull().default(0),
    status: text('status').notNull().default('DRAFT'),
    effectiveAt: timestamp('effective_at', { withTimezone: true }),
    publishedBy: text('published_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUnique: unique('policy_version_number_unique').on(
      t.policyConfigurationId,
      t.versionNumber,
    ),
  }),
);

export type PolicyVersion = typeof policyVersion.$inferSelect;
