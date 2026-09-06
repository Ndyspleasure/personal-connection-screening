import {
  eq,
  getSessionKindByKey,
  listActiveSessionKinds,
  schema,
  sql,
  type Database,
  type PolicyVersion,
  type QuestionnaireVersion,
  type ScoringVersion,
  type SessionKind,
} from '@pcs/db';
import { AppError } from '@pcs/security';

/**
 * SessionCatalogService — the server-authoritative catalog of sessions the
 * candidate can choose (Two-Session phase). Sessions are CMS-managed rows, never
 * hardcoded in the frontend, so a future session is a new row. Also resolves the
 * published (questionnaire, scoring, policy) trio for a chosen session, reusing
 * the version-lock rules (Data §10, §46) — questionnaire + scoring come from the
 * session's own questionnaire; policy is the current published policy (global).
 */

export interface PublishedTrio {
  questionnaireVersion: QuestionnaireVersion;
  scoringVersion: ScoringVersion;
  policyVersion: PolicyVersion;
}

/** Public-safe projection of a session kind (no internal ids). */
export interface SessionKindView {
  key: string;
  name: string;
  description: string | null;
  tagline: string | null;
  requiresAccessCode: boolean;
  accent: string | null;
  order: number;
}

export function toSessionKindView(kind: SessionKind): SessionKindView {
  return {
    key: kind.key,
    name: kind.name,
    description: kind.description,
    tagline: kind.tagline,
    requiresAccessCode: kind.requiresAccessCode,
    accent: kind.accent,
    order: kind.displayOrder,
  };
}

export const sessionCatalogService = {
  /** All ACTIVE kinds, ordered for the picker. */
  async listActive(db: Database): Promise<SessionKind[]> {
    return listActiveSessionKinds(db);
  },

  /** Resolve an ACTIVE kind by its stable key, or fail with NOT_FOUND. */
  async resolveByKey(db: Database, key: string): Promise<SessionKind> {
    const kind = await getSessionKindByKey(db, key);
    if (!kind || kind.status !== 'ACTIVE') throw new AppError('NOT_FOUND', 'session not available');
    return kind;
  },

  /**
   * The default session for a keyless start — the lowest-ordered ACTIVE, open
   * (non-gated) kind. Preserves today's single-questionnaire behaviour.
   */
  async resolveDefault(db: Database): Promise<SessionKind> {
    const kinds = await listActiveSessionKinds(db);
    const open = kinds.find((k) => !k.requiresAccessCode);
    if (!open) throw new AppError('NOT_FOUND', 'no session available');
    return open;
  },

  /** Resolve the frozen-at-start trio for a session's questionnaire. */
  async resolvePublishedForKind(db: Database, kind: SessionKind): Promise<PublishedTrio> {
    const qnRows = await db
      .select()
      .from(schema.questionnaire)
      .where(eq(schema.questionnaire.id, kind.questionnaireId))
      .limit(1);
    const qn = qnRows[0];
    if (!qn?.currentVersionId)
      throw new AppError('NOT_FOUND', 'session questionnaire not published');

    const qvRows = await db
      .select()
      .from(schema.questionnaireVersion)
      .where(eq(schema.questionnaireVersion.id, qn.currentVersionId))
      .limit(1);
    const qv = qvRows[0];
    if (!qv || qv.status !== 'PUBLISHED') {
      throw new AppError('NOT_FOUND', 'current version not published');
    }
    if (!qv.scoringVersionId) {
      throw new AppError('INTEGRITY_ERROR', 'published version missing scoring');
    }

    const svRows = await db
      .select()
      .from(schema.scoringVersion)
      .where(eq(schema.scoringVersion.id, qv.scoringVersionId))
      .limit(1);
    const sv = svRows[0];
    if (!sv || sv.status !== 'PUBLISHED') {
      throw new AppError('INTEGRITY_ERROR', 'scoring not published');
    }

    const pvRows = await db
      .select()
      .from(schema.policyVersion)
      .where(eq(schema.policyVersion.status, 'PUBLISHED'))
      .orderBy(sql`version_number desc`)
      .limit(1);
    const pv = pvRows[0];
    if (!pv) throw new AppError('NOT_FOUND', 'no published policy');

    return { questionnaireVersion: qv, scoringVersion: sv, policyVersion: pv };
  },
};
