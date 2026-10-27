import type { SupabaseClient } from '@supabase/supabase-js';
import type { MatchAnalysisResult } from '@/lib/match/match-types';
import { MatchAnalysisResultSchema } from '@/lib/match/match-types';

export type AnalysisStatus = 'running' | 'completed' | 'failed';

export interface MatchAnalysis {
  id: string;
  owner: string;
  jdId: string;
  status: AnalysisStatus;
  result: MatchAnalysisResult | null;
  error: string | null;
  profileFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

/** Projection for lists: everything the dashboard/entry points need without
 * the (potentially large) result blob. */
export interface MatchAnalysisSummary {
  id: string;
  jdId: string;
  status: AnalysisStatus;
  profileFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, unknown>;

function rowToAnalysis(row: Row): MatchAnalysis {
  return {
    id: row.id as string,
    owner: row.owner as string,
    jdId: row.jd_id as string,
    status: row.status as AnalysisStatus,
    result: row.result ? (MatchAnalysisResultSchema.parse(row.result) as MatchAnalysisResult) : null,
    error: (row.error as string | null) ?? null,
    profileFingerprint: row.profile_fingerprint as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Insert a 'running' row. The unique partial index (one running per jd)
 * surfaces a concurrent duplicate as Postgres 23505 — callers map that to
 * "analysis already in flight", never a second LLM spend.
 */
export async function createAnalysis(
  supa: SupabaseClient,
  userId: string,
  input: { jdId: string; profileFingerprint: string }
): Promise<MatchAnalysis> {
  const { data, error } = await supa
    .from('match_analyses')
    .insert({
      owner: userId,
      jd_id: input.jdId,
      status: 'running',
      profile_fingerprint: input.profileFingerprint,
    })
    .select('*')
    .single();

  if (error) throw error;
  return rowToAnalysis(data as Row);
}

/** Null only for a genuinely absent/foreign row (PGRST116), like getJd. */
export async function getAnalysis(
  supa: SupabaseClient,
  id: string
): Promise<MatchAnalysis | null> {
  const { data, error } = await supa
    .from('match_analyses')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  if (!data) return null;
  return rowToAnalysis(data as Row);
}

// A 'running' row older than this means its worker died mid-request (the
// serverless timeout kills the process before the catch): the row would keep
// blocking reruns through the one_running_per_jd unique index forever.
// shortcut: 10 min assumes no live analysis legitimately runs longer;
// revisit together with the maxDuration/job-queue work in P2.
const RUNNING_STALE_MS = 10 * 60 * 1000;

/**
 * Return the live 'running' analysis for a JD, if any. Side effect by
 * necessity: rows left 'running' past the staleness bound are expired to
 * 'failed' first — a plain SELECT could not unblock the unique index that
 * caps one running row per JD.
 */
export async function getRunningForJd(
  supa: SupabaseClient,
  jdId: string
): Promise<MatchAnalysis | null> {
  const cutoff = new Date(Date.now() - RUNNING_STALE_MS).toISOString();
  const { error: expireError } = await supa
    .from('match_analyses')
    .update({
      status: 'failed',
      error: 'The analysis stopped before finishing — rerun it.',
    })
    .eq('jd_id', jdId)
    .eq('status', 'running')
    .lt('updated_at', cutoff);
  if (expireError) throw expireError;

  const { data, error } = await supa
    .from('match_analyses')
    .select('*')
    .eq('jd_id', jdId)
    .eq('status', 'running')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const row = data as Row;
  return row.status === 'running' ? rowToAnalysis(row) : null;
}

export async function listAnalysesForJd(
  supa: SupabaseClient,
  jdId: string
): Promise<MatchAnalysisSummary[]> {
  const { data, error } = await supa
    .from('match_analyses')
    .select('id, jd_id, status, profile_fingerprint, created_at, updated_at')
    .eq('jd_id', jdId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    jdId: row.jd_id as string,
    status: row.status as AnalysisStatus,
    profileFingerprint: row.profile_fingerprint as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export async function completeAnalysis(
  supa: SupabaseClient,
  id: string,
  result: MatchAnalysisResult
): Promise<void> {
  const { error } = await supa
    .from('match_analyses')
    .update({ status: 'completed', result, error: null })
    .eq('id', id);
  if (error) throw error;
}

/** Failure text shown to the user must be sanitized by the caller — this
 * stores what the route decided is safe, nothing more. */
export async function failAnalysis(supa: SupabaseClient, id: string, error: string): Promise<void> {
  const { error: dbError } = await supa
    .from('match_analyses')
    .update({ status: 'failed', error })
    .eq('id', id);
  if (dbError) throw dbError;
}

export async function saveAnalysisResult(
  supa: SupabaseClient,
  id: string,
  result: MatchAnalysisResult
): Promise<void> {
  const { error } = await supa
    .from('match_analyses')
    .update({ result })
    .eq('id', id);
  if (error) throw error;
}
