import { AppError } from '@pcs/security';
import type { Actor, AdminActor } from '../authz';

/**
 * Authorization guard shared by every admin-only service method (Technology
 * Architecture §71, §74). Fails closed with NOT_AUTHORIZED — the same code and
 * public message regardless of the reason, so no signal leaks (Threat §72).
 * Uses an `asserts` signature so callers can rely on `actor.adminActorId` after.
 */
export function assertAdmin(actor: Actor): asserts actor is AdminActor {
  if (actor.type !== 'ADMIN' || actor.role !== 'OWNER') {
    throw new AppError('NOT_AUTHORIZED');
  }
}
