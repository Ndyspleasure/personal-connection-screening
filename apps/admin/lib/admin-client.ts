/**
 * Tiny client-side fetch wrapper for the admin CMS UI. Same-origin requests, so
 * the browser attaches the Origin header on state-changing calls automatically
 * (satisfying the server's Origin/CSRF gate). Returns a normalized envelope with
 * the safe error message the server produced.
 */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  let data: unknown = null;
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    data = await res.json().catch(() => null);
  }
  const error =
    !res.ok && data && typeof data === 'object' && 'error' in data
      ? ((data as { error: { message?: string; code?: string } }).error?.message ??
        (data as { error: { code?: string } }).error?.code ??
        'Request failed')
      : null;
  return { ok: res.ok, status: res.status, data: (data as T) ?? null, error };
}
