import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Governance domain (Data & State Model §40–44; Technology Architecture §17–18,
 * §56). Two tables land in Phase 5 chunk 1:
 *
 *   - `admin_actor` — the authorization allow-list. A Supabase-authenticated
 *     user is only an admin if a matching, ACTIVE row exists here. MVP ships a
 *     single OWNER role (confirmed decision: "Owner dulu"); the shape leaves
 *     room for more roles later.
 *   - `audit_event` — append-only trail of every privileged action (Data §40,
 *     §79–80). Made immutable at the DB level by a trigger in the next
 *     migration; nothing but INSERT is ever allowed.
 *
 * `security_event` / `integrity_finding` join this domain in Phase 6.
 */
export const adminActor = pgTable('admin_actor', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Supabase Auth user id (stable subject). Nullable until the actor first
  // signs in, so an owner can be pre-provisioned by email.
  subject: text('subject').unique(),
  email: text('email').notNull().unique(),
  role: text('role').notNull().default('OWNER'),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE | DISABLED
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvent = pgTable('audit_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Groups every write that belongs to one request/action (Tech §56; Data §80).
  correlationId: uuid('correlation_id').notNull(),
  actorType: text('actor_type').notNull(), // ADMIN | SYSTEM
  actorId: text('actor_id'), // admin_actor.id, or null for system actions
  action: text('action').notNull(), // e.g. content.profile.updated
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  summary: text('summary'),
  metadata: jsonb('metadata')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * IntegrityService findings (Data §87–90, §100–105, §113; Func §98; Sec §38).
 * Impossible/inconsistent states detected by request-time checks or the
 * scheduled scan. Findings are RECORDED, never silently repaired (INT-02), and
 * are append-only at the DB level (companion trigger migration).
 */
export const integrityFinding = pgTable('integrity_finding', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Groups all findings produced by one scan run (null for request-time checks).
  scanId: uuid('scan_id'),
  kind: text('kind').notNull(), // e.g. PASS_BELOW_PASSING, RESULT_WITHOUT_VERIFICATION
  severity: text('severity').notNull().default('ERROR'),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  detail: jsonb('detail')
    .notNull()
    .default(sql`'{}'::jsonb`),
  status: text('status').notNull().default('OPEN'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AdminActorRecord = typeof adminActor.$inferSelect;
export type AuditEventRecord = typeof auditEvent.$inferSelect;
export type IntegrityFindingRecord = typeof integrityFinding.$inferSelect;
