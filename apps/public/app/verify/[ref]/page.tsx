'use client';

import { use, useEffect, useState } from 'react';

interface VerificationView {
  verificationRef: string;
  status: 'VALID' | 'REVOKED';
  result: 'PASS' | 'FAIL';
  completedAt: string;
  questionnaireVersionLabel: string;
}

/**
 * /verify/[ref] — the PUBLIC verification page (Func §67; confirmed decision:
 * PASS/FAIL + completion date + version label; no numeric score; no answers).
 * Anyone with the reference can view it; per Master §29 the projection is
 * intentionally minimal.
 */
export default function VerifyPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = use(params);
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; view: VerificationView }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/verify/${encodeURIComponent(ref)}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? 'Verification unavailable.');
        }
        const parsed = (await res.json()) as VerificationView;
        if (!cancelled) setState({ kind: 'ok', view: parsed });
      } catch (e) {
        if (!cancelled)
          setState({
            kind: 'error',
            message: e instanceof Error ? e.message : 'Verification unavailable.',
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ref]);

  if (state.kind === 'loading')
    return (
      <main>
        <p className="muted">Looking up…</p>
      </main>
    );
  if (state.kind === 'error')
    return (
      <main>
        <h1>Verification</h1>
        <p className="status-line error">{state.message}</p>
      </main>
    );

  const v = state.view;
  const valid = v.status === 'VALID';
  return (
    <main>
      <h1>Verification</h1>
      <div className="panel">
        <p>
          <span className={`result-badge ${valid ? 'pass' : 'fail'}`}>
            {valid ? 'VALID' : 'REVOKED'}
          </span>{' '}
          <span className={`result-badge ${v.result === 'PASS' ? 'pass' : 'fail'}`}>
            {v.result}
          </span>
        </p>
        <p className="muted">
          Completed {new Date(v.completedAt).toLocaleString()}.
          {v.questionnaireVersionLabel ? ` Version ${v.questionnaireVersionLabel}.` : null}
        </p>
        <p className="muted">Reference {v.verificationRef}</p>
      </div>
    </main>
  );
}
