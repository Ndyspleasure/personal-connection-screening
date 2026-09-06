'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Confirmation dialog for weighty/dangerous actions (e.g. revoke). Animated
 * open, focus moved to the confirm button, ESC + backdrop-click cancel, clear
 * danger hierarchy — so the action's weight is felt, not just stated.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className={`modal-card${danger ? ' danger' : ''}`}>
        <h2>{title}</h2>
        <div className="muted">{children}</div>
        <div className="row spread">
          <button className="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            className={`danger${busy ? ' is-busy' : ''}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
