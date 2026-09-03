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
      <p className="muted">
        CMS modules — content, questionnaire builder, scoring, policy, submissions, audit, and
        integrity — arrive in Phase 5.
      </p>
      <form action="/auth/signout" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
