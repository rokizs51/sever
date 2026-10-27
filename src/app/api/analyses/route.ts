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
import {
  createAnalysis,
  getRunningForJd,
  listAnalysesForJd,
  type MatchAnalysis,
} from '@/lib/db/analyses';
import { computeProfileFingerprint, executeAnalysis } from '@/lib/match/analyze';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/analyses {jdId}
 * Create (or join) a match analysis for an extracted JD against the CURRENT
 * profile. Duplicate protection is the DB's: at most one 'running' row per
 * JD, so a retried request returns the in-flight analysis instead of paying
 * for the model call twice.
 */
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    let body: { jdId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Invalid JSON body' } },
        { status: 400 }
      );
    }

    const { jdId } = body;
    if (!jdId || typeof jdId !== 'string' || !UUID_RE.test(jdId)) {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Field "jdId" must be a valid identifier' } },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = await createRouteClient(cookieStore);

    // Ownership enforced by RLS: a foreign jdId reads as absent.
    const jd = await getJd(supabase, jdId);
    if (!jd) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Job description not found' } },
        { status: 404 }
      );
    }

    // An analysis already running for this JD: join it, never double-run.
    const running = await getRunningForJd(supabase, jdId);
    if (running) {
      return NextResponse.json({ analysis: running, duplicate: true }, { status: 200 });
    }

    // Same quota + global-budget gates as generation, before any LLM call.
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

    const profile = await getOrCreateProfile(supabase, user.id);
    const items = await listItems(supabase, profile.id);
    const fingerprint = computeProfileFingerprint(items);

    let analysis: MatchAnalysis;
    try {
      analysis = await createAnalysis(supabase, user.id, { jdId, profileFingerprint: fingerprint });
    } catch (error) {
      // Lost a race against another create for the same JD (unique index).
      const raced = await getRunningForJd(supabase, jdId);
      if (raced) return NextResponse.json({ analysis: raced, duplicate: true }, { status: 200 });
      throw error;
    }

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
    console.error('Analysis create error:', error);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}

/** GET /api/analyses?jdId=… — analysis history for one JD, newest first. */
export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const jdId = new URL(request.url).searchParams.get('jdId') ?? '';
    if (!UUID_RE.test(jdId)) {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Query "jdId" must be a valid identifier' } },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = await createRouteClient(cookieStore);
    const jd = await getJd(supabase, jdId);
    if (!jd) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Job description not found' } },
        { status: 404 }
      );
    }

    const analyses = await listAnalysesForJd(supabase, jdId);
    return NextResponse.json({ analyses }, { status: 200 });
  } catch (error) {
    console.error('Analysis list error:', error);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
