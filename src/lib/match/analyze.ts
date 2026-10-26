import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JdExtraction, JdRequirement, ProfileItem } from '@/lib/domain/types';
import type { GenAI } from '@/lib/ai/types';
import { estimateCostMicros } from '@/lib/ai/env';
import {
  completeAnalysis,
  failAnalysis,
  type MatchAnalysis,
} from '@/lib/db/analyses';
import type { JobDescription } from '@/lib/db/jds';
import { recordGeneration } from '@/lib/db/quota';
import {
  MatchAnalysisResultSchema,
  type MatchAnalysisModelOutput,
  type MatchAnalysisRequest,
  type MatchEntry,
  type MatchSummary,
  type RequirementRecord,
} from './match-types';

/**
 * Requirements for a JD: the model-extracted records when present, otherwise
 * derived from the legacy flat fields with the same importance weights
 * keywordScore uses (required=mandatory, tools=mandatory, preferred=preferred,
 * responsibilities/seniority/domain=mandatory context lines).
 */
export function requirementsOf(extraction: JdExtraction): RequirementRecord[] {
  if (extraction.requirements && extraction.requirements.length > 0) {
    // Stored post-finalize: ids exist. If any lack one, assign deterministically.
    return extraction.requirements.map((r, i) => ({
      ...r,
      id: r.id ?? `req-${r.category}-${i}`,
    })) as RequirementRecord[];
  }

  const out: RequirementRecord[] = [];
  const push = (
    description: string,
    category: JdRequirement['category'],
    importance: 'mandatory' | 'preferred'
  ) => {
    if (!description.trim()) return;
    out.push({
      id: `req-${category}-${out.length}`,
      description: description.trim(),
      category,
      importance,
      aliases: [],
      sourceExcerpt: null,
    });
  };
  for (const s of extraction.requiredSkills) push(s, 'technical_skill', 'mandatory');
  for (const t of extraction.tools) push(t, 'technical_skill', 'mandatory');
  for (const s of extraction.preferredSkills) push(s, 'technical_skill', 'preferred');
  for (const r of extraction.responsibilities) push(r, 'responsibility', 'mandatory');
  push(extraction.seniority, 'seniority', 'mandatory');
  push(extraction.domain, 'domain_knowledge', 'mandatory');
  return out;
}

/**
 * The no-invention enforcement, run on model output as CODE — prompt rules
 * are hope; these are guarantees:
 * - refs pointing at items that don't exist are dropped;
 * - `supported` must rest on at least one real ref, else it's demoted;
 * - a job-experience/seniority requirement backed only by projects, awards,
 *   snapshots or education is ambiguous at best → `needs_review`
 *   (a personal project never becomes professional experience);
 * - `not_established` / `not_applicable` carry no refs by definition;
 * - requirements the model skipped get an explicit `needs_review`, NOT
 *   `not_established` — the model's silence is not evidence of absence;
 * - the summary is recomputed from final statuses, never trusted from output.
 */
export function normalizeAnalysis(
  output: MatchAnalysisModelOutput,
  requirements: RequirementRecord[],
  items: { itemId: string; type: ProfileItem['type'] }[]
) {
  const itemTypes = new Map(items.map((i) => [i.itemId, i.type]));
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const byReq = new Map<string, MatchEntry>();

  for (const m of output.matches) {
    if (!reqById.has(m.requirementId) || byReq.has(m.requirementId)) continue;
    const req = reqById.get(m.requirementId)!;
    const refs = m.evidenceRefs.filter((e) => itemTypes.has(e.itemId));
    let status = m.status;

    if (status === 'supported' && refs.length === 0) status = 'needs_review';
    if (
      status === 'supported' &&
      (req.category === 'experience' || req.category === 'seniority')
    ) {
      const EMPLOYED: ProfileItem['type'][] = ['experience'];
      const onlyNonEmployment = refs.every((e) => !EMPLOYED.includes(itemTypes.get(e.itemId)!));
      if (onlyNonEmployment) status = 'needs_review';
    }
    if (status === 'not_established' || status === 'not_applicable') refs.length = 0;

    byReq.set(m.requirementId, {
      requirementId: m.requirementId,
      status,
      confidence: m.confidence,
      evidenceRefs: refs,
      explanation: m.explanation,
      followUpQuestion: m.followUpQuestion,
      recommendation: m.recommendation,
    });
  }

  for (const req of requirements) {
    if (!byReq.has(req.id)) {
      byReq.set(req.id, {
        requirementId: req.id,
        status: 'needs_review',
        confidence: 'low',
        evidenceRefs: [],
        explanation:
          'The analysis did not assess this requirement. Review it yourself or rerun — silence is not a verdict.',
      });
    }
  }

  const matches = requirements.map((r) => byReq.get(r.id)!);
  return MatchAnalysisResultSchema.parse({
    requirements,
    matches,
    summary: buildSummary(requirements, matches),
  });
}

function buildSummary(requirements: RequirementRecord[], matches: MatchEntry[]): MatchSummary {
  const totals = {
    requirements: requirements.length,
    supported: 0,
    partial: 0,
    needs_review: 0,
    not_established: 0,
    not_applicable: 0,
  };
  const mandatory: Record<string, number> = {};
  const preferred: Record<string, number> = {};
  for (const m of matches) {
    // User-confirmed status replaces the machine's for counting purposes.
    const status = m.userConfirmation?.status ?? m.status;
    totals[status] += 1;
    const req = requirements.find((r) => r.id === m.requirementId)!;
    const bucket = req.importance === 'mandatory' ? mandatory : preferred;
    bucket[status] = (bucket[status] ?? 0) + 1;
  }

  const desc = (id: string) => requirements.find((r) => r.id === id)!.description;
  const strengthOrder: MatchEntry['status'][] = ['supported', 'partial', 'needs_review'];
  const effective = (m: MatchEntry) => m.userConfirmation?.status ?? m.status;

  return {
    totals,
    byImportance: { mandatory, preferred },
    strongest: matches
      .filter((m) => strengthOrder.indexOf(effective(m)) === 0 && m.evidenceRefs.length > 0)
      .map((m) => desc(m.requirementId))
      .slice(0, 8),
    gaps: matches
      .filter((m) => {
        const req = requirements.find((r) => r.id === m.requirementId)!;
        const status = effective(m);
        return req.importance === 'mandatory' && (status === 'not_established' || status === 'partial' || status === 'needs_review');
      })
      .map((m) => desc(m.requirementId))
      .slice(0, 10),
    questions: matches
      .map((m) => m.followUpQuestion)
      .filter((q): q is string => !!q && q.trim() !== '')
      .slice(0, 10),
    adjustments: matches
      .map((m) => m.recommendation)
      .filter((r): r is string => !!r && r.trim() !== '')
      .slice(0, 10),
  };
}

/**
 * Recompute the summary AFTER user confirmations are merged, so counts and
 * the stored matches never disagree (spec: results are snapshots the UI can
 * trust).
 */
export function rebuildSummary(
  result: { requirements: RequirementRecord[]; matches: MatchEntry[]; summary: MatchSummary }
): MatchSummary {
  return buildSummary(result.requirements, result.matches);
}

/**
 * Staleness fingerprint: sha256 over the sorted (id, canonicalText) pairs of
 * the profile items the analysis actually saw. Any profile text edit, add or
 * remove changes it — GET compares against the live profile and flags stale.
 */
export function computeProfileFingerprint(items: Pick<ProfileItem, 'id' | 'canonicalText'>[]): string {
  const material = items
    .map((i) => `${i.id}:${i.canonicalText}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(material).digest('hex');
}

// Cost-estimate shape mirrors orchestrate's (prompt overhead + chars/4);
// duplicated deliberately to keep lib/match importable from orchestrate
// without an import cycle. shortcut: drift risk if orchestrate's constants
// change — upgrade: share them via lib/ai/env if both ever need tuning.
const PROMPT_OVERHEAD_TOKENS = 800;
const CHARS_PER_TOKEN = 4;

const ANALYSIS_FAIL_MESSAGE =
  'Analysis failed: the model response was unusable after retry. Nothing was stored as a result — rerun when ready.';

/**
 * Run one analysis to completion for an already-created 'running' row:
 * LLM call → spend recorded (money spent is money counted, same discipline
 * as generateResume) → deterministic validation → completed, or failed with
 * a sanitized message. Never a partial result dressed as completed.
 */
export async function executeAnalysis(
  deps: { supa: SupabaseClient; ai: GenAI; userId: string; now: Date; model: string },
  jd: JobDescription,
  items: ProfileItem[],
  analysis: MatchAnalysis
): Promise<MatchAnalysis> {
  const requirements = requirementsOf(jd.extraction);
  // career_snapshot is a self-claim, not evidence; it never establishes a
  // requirement about demonstrated work.
  const evidenceItems = items.filter((i) => i.type !== 'career_snapshot');
  const itemInputs = evidenceItems.map((i) => ({ itemId: i.id, type: i.type, text: i.canonicalText }));

  try {
    const output = await deps.ai.analyzeMatch({ requirements, items: itemInputs });

    const chars =
      evidenceItems.reduce((n, i) => n + i.canonicalText.length + 1, 0) +
      requirements.reduce((n, r) => n + r.description.length + r.aliases.join(' ').length + 1, 0);
    const tokens = {
      input: PROMPT_OVERHEAD_TOKENS + Math.ceil(chars / CHARS_PER_TOKEN),
      output: requirements.length * 80, // status + explanation + refs per requirement
    };
    await recordGeneration(deps.supa, estimateCostMicros(deps.model, tokens));

    const result = normalizeAnalysis(
      output,
      requirements,
      evidenceItems.map((i) => ({ itemId: i.id, type: i.type }))
    );
    await completeAnalysis(deps.supa, analysis.id, result);
    return { ...analysis, status: 'completed', result, error: null };
  } catch (error) {
    console.error('Match analysis error:', error);
    await failAnalysis(deps.supa, analysis.id, ANALYSIS_FAIL_MESSAGE);
    return { ...analysis, status: 'failed', result: null, error: ANALYSIS_FAIL_MESSAGE };
  }
}

/**
 * When generating from a chosen analysis, tailoring follows the ANALYZED
 * requirements: technical-skill descriptions and their aliases join the
 * keyword pool buildFit scores against. Purely additive to the extraction.
 */
export function enrichmentFromAnalysis(
  extraction: JdExtraction,
  result: { requirements: RequirementRecord[] }
): JdExtraction {
  const extra: string[] = [];
  for (const r of result.requirements) {
    if (r.category === 'technical_skill') extra.push(r.description, ...r.aliases);
  }
  if (extra.length === 0) return extraction;
  return { ...extraction, keywords: [...new Set([...extraction.keywords, ...extra])] };
}

export type { MatchAnalysisRequest };
