import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteClient } from '@/lib/db/client';
import { getSessionUser } from '@/lib/auth/session';
import { createGenAI } from '@/lib/ai/client';
import { aiConfig } from '@/lib/ai/env';
import { getJd } from '@/lib/db/jds';
import { getOrCreateProfile } from '@/lib/db/profiles';
import { listItems } from '@/lib/db/items';
import { currentUsage, globalLlmCost, monthKey, GENERATIONS_CAP } from '@/lib/db/quota';
import { createAnalysis, getAnalysis, getRunningForJd } from '@/lib/db/analyses';
import { computeProfileFingerprint, executeAnalysis } from '@/lib/match/analyze';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/analyses/:id/rerun
 * Snapshot semantics: a rerun is a NEW analysis row against the CURRENT
 * profile; the old result stays inspectable. Rerunning is the answer to a
 * stale analysis — results are never silently refreshed under a user's feet.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Analysis not found' } },
        { status: 404 }
      );
    }

    const cookieStore = await cookies();
    const supabase = await createRouteClient(cookieStore);
    const prior = await getAnalysis(supabase, id);
    if (!prior) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Analysis not found' } },
        { status: 404 }
      );
    }

    const running = await getRunningForJd(supabase, prior.jdId);
    if (running) {
      return NextResponse.json(
        { error: { code: 'already_running', message: 'An analysis for this job description is already running' } },
        { status: 409 }
      );
    }

    // Advisory early-out — executeAnalysis holds the atomic reservation.
    const usage = await currentUsage(supabase, user.id, new Date());
    if (usage.generations >= GENERATIONS_CAP) {
      return NextResponse.json(
        { error: { code: 'quota', message: 'Monthly generation quota exceeded' } },
        { status: 429 }
      );
    }
    const config = aiConfig();
    const currentCost = await globalLlmCost(supabase, monthKey(new Date()));
    if (currentCost >= config.monthlyCostCeilingMicros) {
      return NextResponse.json(
        { error: { code: 'budget_exhausted', message: 'Monthly AI budget has been exhausted' } },
        { status: 400 }
      );
    }

    const jd = await getJd(supabase, prior.jdId);
    if (!jd) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'The job description behind this analysis is gone' } },
        { status: 404 }
      );
    }

    const profile = await getOrCreateProfile(supabase, user.id);
    const items = await listItems(supabase, profile.id);
    const analysis = await createAnalysis(supabase, user.id, {
      jdId: prior.jdId,
      profileFingerprint: computeProfileFingerprint(items),
    });

    const settled = await executeAnalysis(
      { supa: supabase, ai: createGenAI(), userId: user.id, now: new Date(), model: config.extractionModel },
      jd,
      items,
      analysis
    );

    return NextResponse.json(
      { analysis: settled },
      { status: settled.status === 'completed' ? 201 : 502 }
    );
  } catch (error) {
    console.error('Analysis rerun error:', error);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
