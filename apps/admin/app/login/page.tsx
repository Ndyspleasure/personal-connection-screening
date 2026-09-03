'use client';

import { createBrowserClient } from '@supabase/ssr';
import { type FormEvent, useState } from 'react';
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '../../lib/supabase/config';

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowserClient(supabaseUrl(), supabaseAnonKey());
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      // Generic message — never reveal whether the account exists (Threat Model §72).
      setError('Sign-in failed. Check your credentials and try again.');
      return;
    }
    window.location.href = '/dashboard';
  }

  if (!configured) {
    return (
      <main>
        <h1>Admin</h1>
        <p className="muted">
          Admin authentication is not configured yet. Set the Supabase environment variables to
          enable sign-in.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Admin sign in</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? (
          <p className="muted" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
