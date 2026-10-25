import type { SupabaseClient } from '@supabase/supabase-js';

export interface QuotaUsage {
  generations: number;
  llmCostMicros: number;
}

export const GENERATIONS_CAP = 50;

/**
 * Returns the month key in 'YYYY-MM' format for a given date (UTC).
 */
export function monthKey(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get current quota usage for a user.
 * Pass an explicit `now` (e.g. orchestrate's deps.now) to make the month key
 * deterministic in tests; defaults to wall-clock.
 */
export async function currentUsage(
  supa: SupabaseClient,
  userId: string,
  now?: Date
): Promise<QuotaUsage> {
  const { data, error } = await supa
    .from('generation_quota')
    .select('generations, llm_cost_micros')
    .eq('user_id', userId)
    .eq('month', monthKey(now ?? new Date()))
    .single();

  if (error) {
    // PGRST116 = no rows found, which is valid (user has no usage yet)
    if (error.code === 'PGRST116') {
      return { generations: 0, llmCostMicros: 0 };
    }
    throw error;
  }

  if (!data) {
    return { generations: 0, llmCostMicros: 0 };
  }

  return {
    generations: data.generations as number,
    llmCostMicros: data.llm_cost_micros as number,
  };
}

/**
 * Record LLM usage for a user (upsert on user_id + month). `generations`
 * defaults to 1 for a CV generation; pass 0 for spend-only calls (CV import)
 * so they are visible to the global budget without consuming the monthly cap.
 */
export async function recordGeneration(
  supa: SupabaseClient,
  userId: string,
  costMicros: number,
  now?: Date,
  generations = 1
): Promise<void> {
  const month = monthKey(now ?? new Date());

  const { data: existing, error: readError } = await supa
    .from('generation_quota')
    .select('generations, llm_cost_micros')
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  if (readError && readError.code !== 'PGRST116') {
    throw readError;
  }

  if (existing) {
    const { error: updateError } = await supa
      .from('generation_quota')
      .update({
        generations: (existing.generations as number) + generations,
        llm_cost_micros: (existing.llm_cost_micros as number) + costMicros,
      })
      .eq('user_id', userId)
      .eq('month', month);

    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supa.from('generation_quota').insert({
      user_id: userId,
      month,
      generations,
      llm_cost_micros: costMicros,
    });

    if (insertError) throw insertError;
  }
}

/**
 * Get global LLM cost for a specific month.
 * Uses the month_llm_cost RPC function which sums llm_cost_micros across all users.
 * Throws on error (same error discipline as other repos).
 */
export async function globalLlmCost(
  supa: SupabaseClient,
  month: string
): Promise<number> {
  const { data, error } = await supa.rpc('month_llm_cost', { p_month: month });

  if (error) {
    throw error;
  }

  return data as number;
}
