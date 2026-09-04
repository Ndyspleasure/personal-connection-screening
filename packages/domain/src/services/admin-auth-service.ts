import {
  countAdminActors,
  getAdminActorByEmail,
  getAdminActorBySubject,
  insertAdminActor,
  linkAdminActorSubject,
  type AdminActorRecord,
  type Database,
} from '@pcs/db';
import { AppError } from '@pcs/security';
import type { AdminActor, AdminRole } from '../authz';

/**
 * AdminAuthService — turns a Supabase-authenticated identity into an authorized
 * {@link AdminActor}, the actor context every privileged service method demands
 * (Technology Architecture §17, §71, §74; Threat TH-042).
 *
 * Authentication (who you are) is Supabase's job; authorization (whether you may
 * act) is ours: a signed-in user is an admin ONLY if a matching, ACTIVE
 * `admin_actor` row exists. The single exception is the first-owner bootstrap —
 * when the allow-list is empty and the caller's email equals
 * ADMIN_BOOTSTRAP_EMAIL, we self-provision the owner. Everything else fails
 * closed with NOT_AUTHORIZED (no signal about why).
 */

export interface AdminIdentity {
  subject: string; // Supabase auth user id
  email: string;
}

function toActor(row: AdminActorRecord): AdminActor {
  return { type: 'ADMIN', adminActorId: row.id, role: row.role as AdminRole };
}

function assertUsable(row: AdminActorRecord): void {
  if (row.status !== 'ACTIVE' || row.role !== 'OWNER') {
    throw new AppError('NOT_AUTHORIZED');
  }
}

export const adminAuthService = {
  /**
   * Resolve (and, on first sign-in, provision/link) the admin actor for a
   * Supabase identity. `bootstrapEmail` comes from server env, never the client.
   */
  async resolveActor(
    db: Database,
    identity: AdminIdentity,
    bootstrapEmail: string,
  ): Promise<AdminActor> {
    const email = identity.email.trim().toLowerCase();
    if (!identity.subject || !email) throw new AppError('NOT_AUTHORIZED');

    // 1) Already known by subject — the steady state.
    const bySubject = await getAdminActorBySubject(db, identity.subject);
    if (bySubject) {
      assertUsable(bySubject);
      return toActor(bySubject);
    }

    // 2) Pre-provisioned by email (subject not yet bound) — bind on first sign-in.
    const byEmail = await getAdminActorByEmail(db, email);
    if (byEmail) {
      assertUsable(byEmail);
      if (byEmail.subject && byEmail.subject !== identity.subject) {
        // Email already claimed by a different subject — refuse.
        throw new AppError('NOT_AUTHORIZED');
      }
      const linked = byEmail.subject
        ? byEmail
        : await linkAdminActorSubject(db, byEmail.id, identity.subject);
      return toActor(linked);
    }

    // 3) First-owner bootstrap: only when the allow-list is empty AND the email
    //    matches the server-configured bootstrap owner.
    const normalizedBootstrap = bootstrapEmail.trim().toLowerCase();
    if (normalizedBootstrap && email === normalizedBootstrap) {
      const existing = await countAdminActors(db);
      if (existing === 0) {
        const created = await insertAdminActor(db, {
          subject: identity.subject,
          email,
          role: 'OWNER',
        });
        return toActor(created);
      }
    }

    throw new AppError('NOT_AUTHORIZED');
  },
};
