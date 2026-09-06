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
      <main className="narrow">
        <div className="skeleton" style={{ height: '2rem', width: '50%', marginBottom: '1rem' }} />
        <div className="skeleton" style={{ height: '6rem' }} />
      </main>
    );
  if (state.kind === 'error')
    return (
      <main className="narrow">
        <h1 className="enter">Verification</h1>
        <p className="status-line error enter enter-1">{state.message}</p>
      </main>
    );

  const v = state.view;
  const valid = v.status === 'VALID';
  return (
    <main className="narrow">
      <span className="eyebrow enter">Verification</span>
      <h1 className="enter enter-1">A verifiable record</h1>
      <div className="panel enter enter-2">
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
