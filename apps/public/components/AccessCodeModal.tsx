'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useReducedMotion } from './useReducedMotion';

type Phase = 'idle' | 'checking' | 'success' | 'error';

const ERROR_COPY: Record<string, string> = {
  ACCESS_CODE_INVALID: 'That code isn’t valid. Double-check it and try again.',
  ACCESS_CODE_EXPIRED: 'That code has expired.',
  ACCESS_CODE_EXHAUSTED: 'That code has reached its usage limit.',
  ACCESS_REQUIRED: 'This session needs an access code.',
  RATE_LIMITED: 'Too many attempts — please wait a moment and try again.',
};

/**
 * Access-code modal for a gated session (Pendekatan). Focus moves to the input
 * on open; ESC / backdrop cancel (with an exit animation); the code is verified
 * on the server. Every state transition is visual: normal → checking → success
 * (glow + smooth route) or error (shake, kept input so it can be fixed). Never
 * relies on animation alone — text + roles carry the state too.
 */
export function AccessCodeModal({
  sessionKey,
  sessionName,
  onClose,
}: {
  sessionKey: string;
  sessionName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, []);

  function requestClose() {
    if (phase === 'checking' || phase === 'success') return;
    setLeaving(true);
    setTimeout(onClose, 220);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const nodes = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [href]',
        );
        if (nodes.length === 0) return;
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  function shake() {
    if (reduced) return;
    inputRef.current?.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-7px)' },
        { transform: 'translateX(7px)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 380, easing: 'ease' },
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (phase === 'checking' || phase === 'success' || !code.trim()) return;
    setPhase('checking');
    setMessage(null);
    try {
      const res = await fetch('/api/public/access-code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey, code: code.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        setPhase('error');
        setMessage(
          ERROR_COPY[body.error?.code ?? ''] ??
            body.error?.message ??
            'Something went wrong. Please try again.',
        );
        shake();
        inputRef.current?.focus();
        return;
      }
      setPhase('success');
      setMessage('Access granted — taking you in…');
      setTimeout(() => router.push('/session'), reduced ? 200 : 720);
    } catch {
      setPhase('error');
      setMessage('Connection problem. Please try again.');
      shake();
    }
  }

  const busy = phase === 'checking';
  return (
    <div
      className={`backdrop${leaving ? ' closing' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acm-title"
        ref={modalRef}
      >
        <span className="eyebrow">🔒 Pendekatan</span>
        <h2 id="acm-title" style={{ marginTop: '0.5rem' }}>
          {sessionName}
        </h2>
        <p className="muted">Enter your access code to continue. Codes are checked securely.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Access code</span>
            <input
              ref={inputRef}
              className={`code-input${phase === 'error' ? ' error' : ''}${phase === 'success' ? ' ok' : ''}`}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (phase === 'error') setPhase('idle');
              }}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy || phase === 'success'}
              aria-invalid={phase === 'error'}
              aria-describedby="acm-msg"
              placeholder="••••-••••"
            />
          </label>
          <p
            id="acm-msg"
            className={`status-line${phase === 'error' ? ' error' : ''}${phase === 'success' ? ' ok' : ''}`}
            role={phase === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {phase === 'checking'
              ? 'Checking your access code…'
              : (message ?? 'This session is invite-only.')}
          </p>
          <div className="row" style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn ghost"
              onClick={requestClose}
              disabled={busy || phase === 'success'}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`btn primary block${busy ? ' busy' : ''}${phase === 'success' ? ' ok' : ''}`}
              disabled={busy || phase === 'success' || !code.trim()}
            >
              {phase === 'success' ? '✓ Granted' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
