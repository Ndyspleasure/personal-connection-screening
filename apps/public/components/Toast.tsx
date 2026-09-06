'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ToastState {
  id: number;
  kind: 'ok' | 'error';
  text: string;
}

/** Imperative-ish toast state; feedback is announced to assistive tech too. */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const notify = useCallback(
    (kind: 'ok' | 'error', text: string) => setToast({ id: Date.now(), kind, text }),
    [],
  );
  const clear = useCallback(() => setToast(null), []);
  return { toast, notify, clear };
}

export function ToastView({ toast, onDone }: { toast: ToastState | null; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setLeaving(false);
    const hold = setTimeout(() => setLeaving(true), 2600);
    const done = setTimeout(onDone, 2860);
    return () => {
      clearTimeout(hold);
      clearTimeout(done);
    };
  }, [toast, onDone]);
  if (!toast) return null;
  return (
    <div
      className={`toast ${toast.kind}${leaving ? ' leaving' : ''}`}
      role="status"
      aria-live="polite"
    >
      {toast.text}
    </div>
  );
}
