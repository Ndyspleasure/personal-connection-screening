import { randomInt } from 'node:crypto';
import {
  getAccessCodeById,
  getSessionKindById,
  insertAccessCode,
  listAccessCodes,
  listAllSessionKinds,
  updateAccessCode,
  updateSessionKind,
  type AccessCodeAdminRow,
  type Database,
  type SessionKind,
} from '@pcs/db';
import { AppError } from '@pcs/security';
import type { AdminActor } from '../authz';
import { assertAdmin } from './errors';
import { auditService } from './audit-service';
import { hashAccessCode, normalizeAccessCode } from './access-code-service';

/**
 * SessionsAdminService — CMS management of session kinds and their access codes
 * (Two-Session phase; Functional §80). Every method is OWNER-guarded and writes
 * an audit event in the same transaction as the change (Data §79). Access codes
 * are never returned in plaintext after creation and their hash is never exposed
 * to any client — the list surfaces only metadata (label, status, usage, expiry).
 */

// Unambiguous alphabet (no I/L/O/0/1) so codes are easy to read and type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export interface AdminCodeView {
  id: string;
  sessionKindId: string;
  sessionKindKey: string | null;
  sessionKindName: string | null;
  label: string | null;
  status: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string | null;
}

function toAdminCodeView(row: AccessCodeAdminRow): AdminCodeView {
  return {
    id: row.id,
    sessionKindId: row.sessionKindId,
    sessionKindKey: row.sessionKindKey,
    sessionKindName: row.sessionKindName,
    label: row.label,
    status: row.status,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    maxUses: row.maxUses,
    useCount: row.useCount,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  };
}

export interface CodeMutationContext {
  correlationId: string;
}

export const sessionsAdminService = {
  async listKinds(db: Database, actor: AdminActor): Promise<SessionKind[]> {
    assertAdmin(actor);
    return listAllSessionKinds(db);
  },

  async updateKind(
    db: Database,
    actor: AdminActor,
    id: string,
    patch: Partial<{
      name: string;
      description: string | null;
      tagline: string | null;
      displayOrder: number;
      status: string;
    }>,
    ctx: CodeMutationContext,
  ): Promise<SessionKind> {
    assertAdmin(actor);
    return db.transaction(async (tx) => {
      const updated = await updateSessionKind(tx, id, patch);
      if (!updated) throw new AppError('NOT_FOUND', 'session kind not found');
      await auditService.record(
        tx,
        { correlationId: ctx.correlationId, actor },
        {
          action: 'session_kind.updated',
          entityType: 'session_kind',
          entityId: id,
          summary: `session "${updated.key}" updated`,
          metadata: { changed: Object.keys(patch) },
        },
      );
      return updated;
    });
  },

  async listCodes(db: Database, actor: AdminActor): Promise<AdminCodeView[]> {
    assertAdmin(actor);
    const rows = await listAccessCodes(db);
    return rows.map(toAdminCodeView);
  },

  /**
   * Create a code for a session kind. Returns the plaintext ONCE (the caller
   * shows it to the admin, who distributes it); only the hash is stored.
   */
  async createCode(
    db: Database,
    secret: string,
    actor: AdminActor,
    input: {
      sessionKindId: string;
      code?: string | null;
      label?: string | null;
      expiresAt?: Date | null;
      maxUses?: number | null;
    },
    ctx: CodeMutationContext,
  ): Promise<{ code: string; id: string }> {
    assertAdmin(actor);
    const plaintext = normalizeAccessCode(
      input.code && input.code.trim() ? input.code : generateCode(),
    );
    const codeHash = hashAccessCode(plaintext, secret);
    return db.transaction(async (tx) => {
      const kind = await getSessionKindById(tx, input.sessionKindId);
      if (!kind) throw new AppError('NOT_FOUND', 'session kind not found');
      let id: string;
      try {
        const row = await insertAccessCode(tx, {
          sessionKindId: kind.id,
          codeHash,
          label: input.label ?? null,
          expiresAt: input.expiresAt ?? null,
          maxUses: input.maxUses ?? null,
          createdBy: actor.adminActorId,
        });
        id = row.id;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new AppError('CONFLICT', 'that code already exists for this session');
        }
        throw err;
      }
      await auditService.record(
        tx,
        { correlationId: ctx.correlationId, actor },
        {
          action: 'access_code.created',
          entityType: 'access_code',
          entityId: id,
          summary: `access code created for "${kind.key}"`,
          metadata: {
            sessionKindKey: kind.key,
            hasExpiry: input.expiresAt != null,
            maxUses: input.maxUses ?? null,
          },
        },
      );
      return { code: plaintext, id };
    });
  },

  async updateCode(
    db: Database,
    actor: AdminActor,
    id: string,
    patch: Partial<{
      label: string | null;
      status: string;
      expiresAt: Date | null;
      maxUses: number | null;
    }>,
    ctx: CodeMutationContext,
  ): Promise<void> {
    assertAdmin(actor);
    await db.transaction(async (tx) => {
      const current = await getAccessCodeById(tx, id);
      if (!current) throw new AppError('NOT_FOUND', 'access code not found');
      const updated = await updateAccessCode(tx, id, patch);
      if (!updated) throw new AppError('NOT_FOUND', 'access code not found');
      const action = patch.status
        ? `access_code.${patch.status.toLowerCase()}`
        : 'access_code.updated';
      await auditService.record(
        tx,
        { correlationId: ctx.correlationId, actor },
        {
          action,
          entityType: 'access_code',
          entityId: id,
          summary: patch.status
            ? `access code ${patch.status.toLowerCase()}`
            : 'access code updated',
          metadata: { changed: Object.keys(patch) },
        },
      );
    });
  },
};
