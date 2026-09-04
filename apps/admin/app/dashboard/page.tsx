import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '../../lib/supabase/config';
import { createClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main>
        <h1>Admin dashboard</h1>
        <p className="muted">
          Admin authentication is not configured yet. Once Supabase is provisioned, this route
          requires a signed-in admin.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main>
      <h1>Admin dashboard</h1>
      <p>Signed in as {user.email}.</p>
      <nav className="panel">
        <h2>CMS modules</h2>
        <ul className="nav-list">
          <li>
            <Link href="/content">Content</Link> — profile & public copy
          </li>
          <li>
            <Link href="/questionnaires">Questionnaires</Link> — build, score & publish
          </li>
          <li>
            <Link href="/policy">Policy</Link> — session lifetime, time limit & retake
          </li>
          <li>
            <Link href="/operations">Operations</Link> — submissions, audit trail & session revoke
          </li>
        </ul>
      </nav>
      <form action="/auth/signout" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
