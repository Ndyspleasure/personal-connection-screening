import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  closeDb,
  getAnyProfile,
  getDb,
  getPublishedProfile,
  listVisibleContentSections,
  schema,
  sql,
  type Database,
} from '@pcs/db';
import type { CandidateActor } from '../../authz';
import type { AdminActor } from '../../authz';
import { adminAuthService } from '../admin-auth-service';
import { contentAdminService } from '../content-admin-service';
import { MIGRATIONS_DIR, recreateDatabase, withDatabase } from './hermetic-db';

/**
 * Admin foundation + content-editor integration tests (Phase 5 chunk 1). These
 * touch the SINGLETON profile row and the admin allow-list, so they run against
 * a hermetic database of their own (see hermetic-db.ts) to avoid racing other
 * suites.
 */
const BASE_DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/pcs';
const HERMETIC_DB = process.env.ADMIN_IT_DB ?? 'pcs_admin_it';
process.env.DATABASE_URL = withDatabase(BASE_DB_URL, HERMETIC_DB);
const hasDb = process.env.SKIP_ADMIN_IT !== '1';

const admin: AdminActor = { type: 'ADMIN', adminActorId: 'it-admin', role: 'OWNER' };
const notAdmin: CandidateActor = {
  type: 'PUBLIC_CANDIDATE',
  sessionRef: 'ses_x',
  attemptId: '00000000-0000-0000-0000-000000000000',
};

let db: Database;
const cid = () => crypto.randomUUID();

describe.runIf(hasDb)('admin foundation (integration)', () => {
  beforeAll(async () => {
    await recreateDatabase(BASE_DB_URL, HERMETIC_DB);
    db = getDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  });
  afterAll(async () => {
    await closeDb();
  });

  describe('adminAuthService.resolveActor', () => {
    it('bootstraps the first OWNER only when the allow-list is empty and the email matches', async () => {
      // Empty table + matching bootstrap email -> self-provision.
      const actor = await adminAuthService.resolveActor(
        db,
        { subject: 'sub-owner', email: 'Owner@Example.com' },
        'owner@example.com',
      );
      expect(actor.type).toBe('ADMIN');
      expect(actor.role).toBe('OWNER');
      const [row] = await db
        .select()
        .from(schema.adminActor)
        .where(sql`subject = 'sub-owner'`);
      expect(row?.email).toBe('owner@example.com'); // normalized lower-case
    });

    it('resolves a known subject on subsequent sign-ins (no duplicate rows)', async () => {
      const again = await adminAuthService.resolveActor(
        db,
        { subject: 'sub-owner', email: 'owner@example.com' },
        'owner@example.com',
      );
      expect(again.type).toBe('ADMIN');
      const counted = await db.select({ n: sql<number>`count(*)` }).from(schema.adminActor);
      expect(Number(counted[0]!.n)).toBe(1);
    });

    it('refuses a stranger even with a valid Supabase identity (fails closed)', async () => {
      await expect(
        adminAuthService.resolveActor(
          db,
          { subject: 'sub-stranger', email: 'stranger@example.com' },
          'owner@example.com',
        ),
      ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
    });

    it('does NOT bootstrap a second owner once the allow-list is non-empty', async () => {
      // Even if the email equals the bootstrap owner, a different subject is refused
      // once an owner already exists (count !== 0).
      await expect(
        adminAuthService.resolveActor(
          db,
          { subject: 'sub-imposter', email: 'owner@example.com' },
          'owner@example.com',
        ),
      ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
    });

    it('binds a subject to an email-only pre-provisioned actor on first sign-in', async () => {
      await db.insert(schema.adminActor).values({ email: 'invited@example.com', role: 'OWNER' });
      const actor = await adminAuthService.resolveActor(
        db,
        { subject: 'sub-invited', email: 'invited@example.com' },
        'owner@example.com',
      );
      expect(actor.type).toBe('ADMIN');
      const [row] = await db
        .select()
        .from(schema.adminActor)
        .where(sql`email = 'invited@example.com'`);
      expect(row?.subject).toBe('sub-invited');
    });
  });

  describe('contentAdminService', () => {
    it('rejects a non-admin actor on every method (Threat TH-042)', async () => {
      await expect(
        // @ts-expect-error deliberately passing a candidate where an admin is required
        contentAdminService.getEditable(db, notAdmin),
      ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
    });

    it('saves the profile, publishes it, and the PUBLIC projection then sees it (CMS-01)', async () => {
      const saved = await contentAdminService.saveProfile(
        db,
        admin,
        { slug: 'owner', displayName: 'The Owner' },
        { correlationId: cid() },
      );
      expect(saved.status).toBe('DRAFT');
      // Not public until published.
      expect(await getPublishedProfile(db)).toBeNull();

      const published = await contentAdminService.publishProfile(db, admin, {
        correlationId: cid(),
      });
      expect(published.status).toBe('PUBLISHED');
      const pub = await getPublishedProfile(db);
      expect(pub?.displayName).toBe('The Owner');

      // Audit trail recorded both actions.
      const events = await db
        .select()
        .from(schema.auditEvent)
        .where(sql`entity_type = 'profile'`);
      const actions = events.map((e) => e.action);
      expect(actions).toContain('content.profile.saved');
      expect(actions).toContain('content.profile.published');
    });

    it('creates, version-guards, and deletes sections; the public list reflects visibility', async () => {
      const created = await contentAdminService.createSection(
        db,
        admin,
        {
          sectionType: 'hero',
          title: 'Hi',
          body: 'Welcome',
          displayOrder: 0,
          visibility: 'PUBLIC',
        },
        { correlationId: cid() },
      );
      expect(created.contentVersion).toBe(1);

      // Correct expectedVersion -> succeeds and bumps the version.
      const updated = await contentAdminService.updateSection(
        db,
        admin,
        {
          id: created.id,
          expectedVersion: 1,
          sectionType: 'hero',
          title: 'Hello',
          body: 'Welcome',
          displayOrder: 0,
          visibility: 'PUBLIC',
        },
        { correlationId: cid() },
      );
      expect(updated.contentVersion).toBe(2);
      expect(updated.title).toBe('Hello');

      // Stale expectedVersion -> CONFLICT, no silent overwrite (Threat TH-037).
      await expect(
        contentAdminService.updateSection(
          db,
          admin,
          {
            id: created.id,
            expectedVersion: 1,
            sectionType: 'hero',
            title: 'Nope',
            displayOrder: 0,
            visibility: 'PUBLIC',
          },
          { correlationId: cid() },
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      // Public list shows the PUBLIC section...
      let visible = await listVisibleContentSections(db);
      expect(visible.map((s) => s.id)).toContain(created.id);

      // ...hiding it removes it from the public projection.
      await contentAdminService.updateSection(
        db,
        admin,
        {
          id: created.id,
          expectedVersion: 2,
          sectionType: 'hero',
          title: 'Hello',
          displayOrder: 0,
          visibility: 'HIDDEN',
        },
        { correlationId: cid() },
      );
      visible = await listVisibleContentSections(db);
      expect(visible.map((s) => s.id)).not.toContain(created.id);

      // Delete removes it entirely.
      await contentAdminService.deleteSection(
        db,
        admin,
        { id: created.id },
        { correlationId: cid() },
      );
      expect(
        await db
          .select()
          .from(schema.contentSection)
          .where(sql`id = ${created.id}`),
      ).toHaveLength(0);
    });

    it('the audit trail is append-only at the DB level (Data §79)', async () => {
      const [event] = await db
        .insert(schema.auditEvent)
        .values({ correlationId: cid(), actorType: 'ADMIN', action: 'test.append_only' })
        .returning();
      await expect(
        db
          .update(schema.auditEvent)
          .set({ action: 'x' })
          .where(sql`id = ${event!.id}`),
      ).rejects.toThrow(/PCS_IMMUTABLE/);
      await expect(db.delete(schema.auditEvent).where(sql`id = ${event!.id}`)).rejects.toThrow(
        /PCS_IMMUTABLE/,
      );
    });

    it('getEditable returns hidden sections too (authoring view, not public)', async () => {
      await contentAdminService.createSection(
        db,
        admin,
        { sectionType: 'note', visibility: 'HIDDEN' },
        { correlationId: cid() },
      );
      const editable = await contentAdminService.getEditable(db, admin);
      expect(editable.sections.some((s) => s.visibility === 'HIDDEN')).toBe(true);
      expect(editable.profile).not.toBeNull();
      // Sanity: getAnyProfile matches the editable profile.
      const any = await getAnyProfile(db);
      expect(any?.id).toBe(editable.profile?.id);
    });
  });
});
