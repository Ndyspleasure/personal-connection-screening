import {
  deleteContentSection,
  getAnyProfile,
  getContentSection,
  insertContentSection,
  listAllContentSections,
  publishProfileRow,
  updateContentSectionWithVersion,
  upsertProfile,
  type ContentSection,
  type Database,
  type Profile,
} from '@pcs/db';
import { AppError } from '@pcs/security';
import type { AdminActor } from '../authz';
import { assertAdmin } from './errors';
import { auditService } from './audit-service';

/**
 * ContentAdminService — the CMS editing surface for display-only content
 * (Functional §80; Data §6–7). Every method is OWNER-guarded (Threat TH-042)
 * and writes an audit event in the SAME transaction as the change, so the trail
 * can never drift from the data (Data §79). Section edits use optimistic
 * concurrency: a stale `expectedVersion` fails with CONFLICT, never a silent
 * overwrite (Threat TH-037; Func §113).
 */

export interface EditableContent {
  profile: Profile | null;
  sections: ContentSection[];
}

export interface SectionInput {
  sectionType: string;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  displayOrder?: number;
  visibility?: string;
}

export interface MutationContext {
  correlationId: string;
}

export const contentAdminService = {
  async getEditable(db: Database, actor: AdminActor): Promise<EditableContent> {
    assertAdmin(actor);
    const [profile, sections] = await Promise.all([getAnyProfile(db), listAllContentSections(db)]);
    return { profile, sections };
  },

  async saveProfile(
    db: Database,
    actor: AdminActor,
    input: { slug: string; displayName: string },
    ctx: MutationContext,
  ): Promise<Profile> {
    assertAdmin(actor);
    return db.transaction(async (tx) => {
      const saved = await upsertProfile(tx, input);
      await auditService.record(
        tx,
        { correlationId: ctx.correlationId, actor },
        {
          action: 'content.profile.saved',
          entityType: 'profile',
          entityId: saved.id,
          summary: `profile "${saved.slug}" saved`,
          metadata: { slug: saved.slug, displayName: saved.displayName },
        },
      );
      return saved;
    });
  },

  async publishProfile(db: Database, actor: AdminActor, ctx: MutationContext): Promise<Profile> {
    assertAdmin(actor);
    return db.transaction(async (tx) => {
      const existing = await getAnyProfile(tx);
      if (!existing) throw new AppError('NOT_FOUND', 'no profile to publish');
      const published = await publishProfileRow(tx, existing.id);
      await auditService.record(
        tx,
        { correlationId: ctx.correlationId, actor },
        {
          action: 'content.profile.published',
          entityType: 'profile',
          entityId: published.id,
          summary: `profile "${published.slug}" published`,
        },
      );
      return published;
    });
  },

  async createSection(
    db: Database,
    actor: AdminActor,
    input: SectionInput,
    ctx: MutationContext,
  ): Promise<ContentSection> {
    assertAdmin(actor);
    return db.transaction(async (tx) => {
      const created = await insertContentSection(tx, input);
      await auditService.record(
        tx,
        { correlationId: ctx.correlationId, actor },
        {
          action: 'content.section.created',
          entityType: 'content_section',
          entityId: created.id,
          summary: `section "${created.sectionType}" created`,
        },
      );
      return created;
    });
  },

  async updateSection(
    db: Database,
    actor: AdminActor,
    input: { id: string; expectedVersion: number } & SectionInput,
    ctx: MutationContext,
  ): Promise<ContentSection> {
    assertAdmin(actor);
    return db.transaction(async (tx) => {
      const current = await getContentSection(tx, input.id);
      if (!current) throw new AppError('NOT_FOUND', 'section not found');
      const updated = await updateContentSectionWithVersion(tx, input);
      if (!updated) {
        // The row exists but the version moved — someone edited concurrently.
        throw new AppError('CONFLICT', 'section changed since it was loaded');
      }
      await auditService.record(
        tx,
        { correlationId: ctx.correlationId, actor },
        {
          action: 'content.section.updated',
          entityType: 'content_section',
          entityId: updated.id,
          summary: `section "${updated.sectionType}" updated to v${updated.contentVersion}`,
          metadata: { fromVersion: input.expectedVersion, toVersion: updated.contentVersion },
        },
      );
      return updated;
    });
  },

  async deleteSection(
    db: Database,
    actor: AdminActor,
    input: { id: string },
    ctx: MutationContext,
  ): Promise<void> {
    assertAdmin(actor);
    return db.transaction(async (tx) => {
      const current = await getContentSection(tx, input.id);
      if (!current) throw new AppError('NOT_FOUND', 'section not found');
      await deleteContentSection(tx, input.id);
      await auditService.record(
        tx,
        { correlationId: ctx.correlationId, actor },
        {
          action: 'content.section.deleted',
          entityType: 'content_section',
          entityId: input.id,
          summary: `section "${current.sectionType}" deleted`,
        },
      );
    });
  },
};
