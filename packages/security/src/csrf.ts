/**
 * Origin-based CSRF protection for cookie-authenticated, state-changing requests
 * (Technology Architecture §81; Threat Model TH-049). Combined with SameSite
 * cookies; not a replacement for authorization.
 */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isStateChangingMethod(method: string): boolean {
  return STATE_CHANGING_METHODS.has(method.toUpperCase());
}

export function isAllowedOrigin(
  origin: string | null | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin) return false;
  return allowed.includes(origin);
}

/**
 * Returns true if a state-changing request may proceed. Safe (idempotent) methods
 * always pass; state-changing methods require an allow-listed Origin header.
 */
export function isRequestOriginValid(params: {
  method: string;
  origin: string | null | undefined;
  allowedOrigins: readonly string[];
}): boolean {
  if (!isStateChangingMethod(params.method)) return true;
  return isAllowedOrigin(params.origin, params.allowedOrigins);
}
