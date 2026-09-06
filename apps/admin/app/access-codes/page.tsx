'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/admin-client';
import { ToastView, type ToastState } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';

/**
 * Access-code management (Two-Session phase; phase "Pengelolaan Kode Pada CMS").
 * The CMS is the single source of truth for Pendekatan codes: create, view
 * usage, activate/disable, revoke, and set expiry / usage caps — all verified
 * server-side. Codes are shown in plaintext ONCE at creation and never again
 * (only a hash is stored). Every action gives clear visual feedback; revoke is
 * a deliberate, animated danger-confirm.
 */

interface KindRow {
  id: string;
  key: string;
  name: string;
  requiresAccessCode: boolean;
  status: string;
}
interface CodeRow {
  id: string;
  sessionKindId: string;
  sessionKindKey: string | null;
  sessionKindName: string | null;
  label: string | null;
  status: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string | null;
}

const when = (iso: string | null) => (iso ? iso.replace('T', ' ').slice(0, 16) : '—');
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

export default function AccessCodesPage() {
  const [loading, setLoading] = useState(true);
  const [kinds, setKinds] = useState<KindRow[]>([]);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const notify = useCallback(
    (kind: 'ok' | 'error', text: string) => setToast({ id: Date.now(), kind, text }),
    [],
  );

  // Create form.
  const [kindId, setKindId] = useState('');
  const [label, setLabel] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  // Per-row + dialog state.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<CodeRow | null>(null);
  const [editing, setEditing] = useState<CodeRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [k, c] = await Promise.all([
      api<{ kinds: KindRow[] }>('/api/admin/session-kinds'),
      api<{ codes: CodeRow[] }>('/api/admin/access-codes'),
    ]);
    if (!k.ok || !c.ok) {
      const first = [k, c].find((r) => !r.ok);
      notify(
        'error',
        first?.status === 403
          ? 'Not authorized, or admin auth is not configured.'
          : 'Failed to load.',
      );
      setLoading(false);
      return;
    }
    setKinds(k.data?.kinds ?? []);
    setCodes(c.data?.codes ?? []);
    setKindId(
      (prev) =>
        prev || k.data?.kinds.find((x) => x.requiresAccessCode)?.id || k.data?.kinds[0]?.id || '',
    );
    setLoading(false);
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const gatedKinds = useMemo(() => kinds.filter((k) => k.requiresAccessCode), [kinds]);

  async function createCode() {
    if (!kindId || creating) return;
    setCreating(true);
    setRevealed(null);
    const res = await api<{ code: string; id: string }>('/api/admin/access-codes', {
      method: 'POST',
      body: {
        sessionKindId: kindId,
        code: customCode.trim() || undefined,
        label: label.trim() || null,
        expiresAt: toIso(expiresAt),
        maxUses: maxUses.trim() ? Number(maxUses) : null,
      },
    });
    setCreating(false);
    if (!res.ok || !res.data) return notify('error', res.error ?? 'Could not create the code.');
    setRevealed(res.data.code);
    setLabel('');
    setCustomCode('');
    setExpiresAt('');
    setMaxUses('');
    notify('ok', 'Access code created.');
    await load();
  }

  async function patchCode(id: string, body: Record<string, unknown>, okText: string) {
    setBusyId(id);
    const res = await api(`/api/admin/access-codes/${id}`, { method: 'PATCH', body });
    setBusyId(null);
    if (!res.ok) {
      notify('error', res.error ?? 'Update failed.');
      return false;
    }
    notify('ok', okText);
    await load();
    return true;
  }

  async function confirmRevoke() {
    if (!revoking) return;
    const ok = await patchCode(revoking.id, { status: 'REVOKED' }, 'Access code revoked.');
    if (ok) setRevoking(null);
  }

  async function saveEdits() {
    if (!editing) return;
    const ok = await patchCode(
      editing.id,
      {
        label: editing.label?.trim() ? editing.label.trim() : null,
        expiresAt: editing.expiresAt ? new Date(editing.expiresAt).toISOString() : null,
        maxUses: editing.maxUses ?? null,
      },
      'Access code updated.',
    );
    if (ok) setEditing(null);
  }

  return (
    <main className="wide">
      <p className="crumbs">
        <Link href="/dashboard">← Dashboard</Link>
      </p>
      <h1>Access codes</h1>
      <p className="muted">
        Codes gate exclusive sessions (e.g. Pendekatan). They are checked on the server and shown in
        full only once, here, at creation.
      </p>

      <section className="panel">
        <h2>Create a code</h2>
        {gatedKinds.length === 0 ? (
          <p className="muted small">
            No gated sessions exist yet. A session must require an access code before codes apply.
          </p>
        ) : null}
        <div className="row">
          <label className="field inline">
            <span>Session</span>
            <select value={kindId} onChange={(e) => setKindId(e.target.value)}>
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                  {k.requiresAccessCode ? '' : ' (open)'}
                </option>
              ))}
            </select>
          </label>
          <label className="field inline">
            <span>Label (optional)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. for Andi"
            />
          </label>
        </div>
        <div className="row">
          <label className="field inline">
            <span>Custom code (blank = auto)</span>
            <input
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              placeholder="auto-generated"
              autoCapitalize="characters"
            />
          </label>
          <label className="field inline">
            <span>Expires (optional)</span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
          <label className="field inline">
            <span>Max uses (optional)</span>
            <input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="∞"
            />
          </label>
        </div>
        <button
          className={creating ? 'is-busy' : ''}
          onClick={createCode}
          disabled={creating || !kindId}
        >
          Create code
        </button>

        {revealed ? (
          <div className="code-reveal">
            <p className="small muted" style={{ margin: '0 0 0.35rem' }}>
              Copy this now — it won’t be shown again:
            </p>
            <div className="row spread">
              <span className="value">{revealed}</span>
              <button
                className="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(revealed).then(
                    () => notify('ok', 'Copied to clipboard.'),
                    () => notify('error', 'Copy failed — select it manually.'),
                  );
                }}
              >
                Copy
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>Existing codes</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : codes.length === 0 ? (
          <p className="muted">No codes yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Label</th>
                  <th>Status</th>
                  <th>Uses</th>
                  <th>Expires</th>
                  <th>Last used</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const badge =
                    c.status === 'ACTIVE'
                      ? 'active'
                      : c.status === 'REVOKED'
                        ? 'revoked'
                        : 'disabled';
                  return (
                    <tr key={c.id}>
                      <td>{c.sessionKindName ?? c.sessionKindKey ?? '—'}</td>
                      <td>{c.label ?? '—'}</td>
                      <td>
                        <span className={`badge ${badge}`}>{c.status}</span>
                      </td>
                      <td>
                        {c.useCount}
                        {c.maxUses != null ? ` / ${c.maxUses}` : ''}
                      </td>
                      <td>{when(c.expiresAt)}</td>
                      <td>{when(c.lastUsedAt)}</td>
                      <td>
                        {c.status !== 'REVOKED' ? (
                          <div className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
                            <button
                              className="ghost"
                              onClick={() => setEditing(c)}
                              disabled={busyId === c.id}
                            >
                              Edit
                            </button>
                            <button
                              className={`ghost${busyId === c.id ? ' is-busy' : ''}`}
                              disabled={busyId === c.id}
                              onClick={() =>
                                patchCode(
                                  c.id,
                                  { status: c.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' },
                                  c.status === 'ACTIVE' ? 'Code disabled.' : 'Code enabled.',
                                )
                              }
                            >
                              {c.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              className="danger"
                              onClick={() => setRevoking(c)}
                              disabled={busyId === c.id}
                            >
                              Revoke
                            </button>
                          </div>
                        ) : (
                          <span className="muted small">revoked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={revoking !== null}
        title="Revoke this code?"
        danger
        confirmLabel="Revoke"
        busy={busyId === revoking?.id}
        onConfirm={confirmRevoke}
        onCancel={() => setRevoking(null)}
      >
        Revoking is permanent — the code can never open a session again. Anyone who has it will be
        turned away.
      </ConfirmDialog>

      {editing ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Edit code"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div className="modal-card">
            <h2>Edit code</h2>
            <label className="field">
              <span>Label</span>
              <input
                value={editing.label ?? ''}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Expires (blank = never)</span>
              <input
                type="datetime-local"
                value={editing.expiresAt ? editing.expiresAt.slice(0, 16) : ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    expiresAt: e.target.value ? toIso(e.target.value) : null,
                  })
                }
              />
            </label>
            <label className="field">
              <span>Max uses (blank = unlimited)</span>
              <input
                type="number"
                min={1}
                value={editing.maxUses ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    maxUses: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
            <div className="row spread">
              <button
                className="ghost"
                onClick={() => setEditing(null)}
                disabled={busyId === editing.id}
              >
                Cancel
              </button>
              <button
                className={busyId === editing.id ? 'is-busy' : ''}
                onClick={saveEdits}
                disabled={busyId === editing.id}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ToastView toast={toast} onDone={() => setToast(null)} />
    </main>
  );
}
