import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createRouteClient } from '@/lib/db/client';
import { getSessionUser } from '@/lib/auth/session';
import { getAnalysis } from '@/lib/db/analyses';
import { getOrCreateProfile } from '@/lib/db/profiles';
import { listItems } from '@/lib/db/items';
import { computeProfileFingerprint } from '@/lib/match/analyze';
import AppShell from '@/components/shell/app-shell';
import AnalysisView from '@/components/analysis/analysis-view';

// Session-reading page — must block server-side so the guard can redirect
// before anything renders (cacheComponents sanctioned opt-out).
export const instant = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const cookieStore = await cookies();
  const supabase = await createRouteClient(cookieStore);
  const analysis = await getAnalysis(supabase, id); // RLS: foreign ids → 404
  if (!analysis) notFound();

  const profile = await getOrCreateProfile(supabase, user.id);
  const items = await listItems(supabase, profile.id);
  const stale =
    analysis.status === 'completed' &&
    computeProfileFingerprint(items) !== analysis.profileFingerprint;

  // Evidence display needs the recorded text; the analysis itself stores only
  // item ids (no profile copies — snapshot refs, live text at render time).
  const evidenceText: Record<string, { type: string; text: string }> = {};
  for (const item of items) {
    evidenceText[item.id] = { type: item.type, text: item.canonicalText };
  }

  return (
    <AppShell email={user.email ?? undefined}>
      <main className="px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {/* AnalysisView carries the page's single visible h1. */}
          <AnalysisView analysis={analysis} stale={stale} evidenceText={evidenceText} />
        </div>
      </main>
    </AppShell>
  );
}
