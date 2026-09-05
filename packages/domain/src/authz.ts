/**
 * Actor context passed to every protected service method (Technology
 * Architecture §71, §73–74). Authorization derives from validated server
 * context — never from a browser-supplied id (Threat Model TH-007, TH-042).
 */
export interface CandidateActor {
  readonly type: 'PUBLIC_CANDIDATE';
  readonly sessionRef: string;
  readonly attemptId: string;
}

/** MVP: single OWNER role; the shape leaves room for future roles (Tech §18). */
export type AdminRole = 'OWNER';

export interface AdminActor {
  readonly type: 'ADMIN';
  readonly adminActorId: string;
  readonly role: AdminRole;
}

export type Actor = CandidateActor | AdminActor;

export function isAdmin(actor: Actor): actor is AdminActor {
  return actor.type === 'ADMIN';
}
