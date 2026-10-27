import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteClient } from '@/lib/db/client';
import { getSessionUser } from '@/lib/auth/session';
import { createGenAI } from '@/lib/ai/client';
import { aiConfig, estimateCostMicros } from '@/lib/ai/env';
import { JdNotParseableError } from '@/lib/ai/types';
import { createJd } from '@/lib/db/jds';
import { globalLlmCost, monthKey, recordGeneration } from '@/lib/db/quota';

// Same ceiling as the CV import (profile/import/route.ts): one LLM pass.
const MAX_JD_CHARS = 40_000;

export async function POST(request: Request) {
  try {
    // 1. Session check
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // Parse request body
    let body: { raw?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Invalid JSON body' } },
        { status: 400 }
      );
    }

    const raw = body.raw;
    if (typeof raw !== 'string') {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Field "raw" must be a string' } },
        { status: 400 }
      );
    }

    // 2. Length guard
    if (raw.trim().length < 80) {
      return NextResponse.json(
        { error: { code: 'too_short', message: 'Job description text must be at least 80 characters' } },
        { status: 400 }
      );
    }
    if (raw.length > MAX_JD_CHARS) {
      return NextResponse.json(
        { error: { code: 'too_long', message: 'That job description is too long to read in one pass. Paste only the job post.' } },
        { status: 400 }
      );
    }

    // 3. Cost ceiling check (before LLM call)
    const config = aiConfig();
    const cookieStore = await cookies();
    const supabase = await createRouteClient(cookieStore);

    const month = monthKey(new Date());
    const currentCost = await globalLlmCost(supabase, month);
    
    if (currentCost >= config.monthlyCostCeilingMicros) {
      return NextResponse.json(
        { error: { code: 'budget_exhausted', message: 'Monthly AI budget has been exhausted' } },
        { status: 400 }
      );
    }

    // 4. Extract JD via GenAI
    const genAI = createGenAI();
    let extraction;
    try {
      extraction = await genAI.extractJd(raw);
    } catch (error) {
      if (error instanceof JdNotParseableError) {
        return NextResponse.json(
          { 
            error: { 
              code: 'not_a_job_description', 
              message: 'Could not parse this as a valid job description. Please provide more detailed text and try again.' 
            } 
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // 5. Spend-only ledger entry so extraction reaches the global budget
    // breaker without consuming a generation. Best-effort, and recorded
    // before persistence: money spent is money counted — a ledger failure
    // must not throw away an extraction the user already paid for.
    try {
      const tokens = {
        input: Math.ceil(raw.length / 4) + 800,
        output: Math.ceil(JSON.stringify(extraction).length / 4),
      };
      await recordGeneration(supabase, estimateCostMicros(config.extractionModel, tokens), 0);
    } catch (error) {
      console.error('JD extraction cost recording failed:', error);
    }

    // 6. Persist
    const jd = await createJd(supabase, user.id, raw, extraction);

    // 6. Success
    return NextResponse.json(
      { jdId: jd.id, extraction: jd.extraction },
      { status: 200 }
    );
  } catch (error) {
    console.error('JD extraction error:', error);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
