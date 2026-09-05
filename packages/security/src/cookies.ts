import { PUBLIC_SESSION_COOKIE } from '@pcs/config';

/** Framework-neutral cookie attributes (Technology Architecture §14; Threat Model §67). */
export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge?: number;
}

export const SESSION_COOKIE_NAME = PUBLIC_SESSION_COOKIE;

/**
 * Options for the public session-continuity cookie. The cookie carries only the
 * opaque token reference — never score, result, answers, or authorization flags
 * (Technology Architecture §12; Threat Model §67).
 */
export function sessionCookieOptions(params: {
  secure: boolean;
  maxAgeSeconds?: number;
}): CookieOptions {
  return {
    httpOnly: true,
    secure: params.secure,
    sameSite: 'lax',
    path: '/',
    ...(params.maxAgeSeconds !== undefined ? { maxAge: params.maxAgeSeconds } : {}),
  };
}

/** Options used to clear the session cookie. */
export function clearedSessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 };
}
