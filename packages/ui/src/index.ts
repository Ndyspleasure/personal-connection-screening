/**
 * Shared UI primitives (Technology Architecture §5). Kept intentionally minimal
 * for the foundation; component library grows with the candidate flow (Phase 4)
 * and CMS (Phase 5).
 */

/** Join class names, dropping falsy values. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
