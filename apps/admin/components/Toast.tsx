'use client';

import { useEffect, useState } from 'react';

export interface ToastState {
  id: number;
  kind: 'ok' | 'error';
  text: string;
}

/**
 * Small toast host — animated in, held, then animated out (opacity/transform
 * only, reduced-motion aware via CSS). Also announced to assistive tech so the
 * feedback is never purely visual.
 */
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
