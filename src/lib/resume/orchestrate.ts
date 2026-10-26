import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenAI } from '@/lib/ai/types';
import type {
  GenMode,
  ResumeDoc,
  ResumeHeader,
  ResumeSection,
  Suggestion,
  SuggestionState,
} from '@/lib/domain/types';
import type { GeneratedResume } from '@/lib/db/resumes';
import type { FitResultSnapshot } from '@/lib/resume/fit-types';
import { getOrCreateProfile } from '@/lib/db/profiles';
import { listItems } from '@/lib/db/items';
import { getJd } from '@/lib/db/jds';
import { saveResume } from '@/lib/db/resumes';
import { currentUsage, recordGeneration, GENERATIONS_CAP, globalLlmCost, monthKey } from '@/lib/db/quota';
import { isEarlyCareer, orderSections } from '@/lib/resume/scoring';
import { buildFit, snapshotOf } from '@/lib/resume/fit';
import { estimateCostMicros } from '@/lib/ai/env';
import { hasUnsupportedNumbers } from '@/lib/ai/client';
import { normalizeManualText } from '@/lib/domain/canonical';
import { getAnalysis, type MatchAnalysis } from '@/lib/db/analyses';
import { computeProfileFingerprint, enrichmentFromAnalysis } from '@/lib/match/analyze';

export interface OrchestrateDeps {
  supa: SupabaseClient;
  ai: GenAI;
  now: Date;
  user: { id: string; email: string };
  enhanceModel: string;
  monthlyCostCeilingMicros: number;
}

// Rough token model for one enhance generation (composeSummary + enhance
// combined), scaled to what is actually sent — a fixed 1000/500 assumption
// under-counts a full-page profile by 2-4x and would trip the global budget
// breaker only after real spend overshot the ceiling. Used solely for
// PRICING_JSON cost estimates; never shown to users as exact usage.
// Exported for tests.
export const ESTIMATE_PROMPT_OVERHEAD_TOKENS = 800; // system + JD context + instructions
export const ESTIMATE_CHARS_PER_TOKEN = 4;
export const ESTIMATE_OUTPUT_TOKENS_PER_BULLET = 80; // rewrite + basis per bullet
export const ESTIMATE_SUMMARY_OUTPUT_TOKENS = 150; // composed headline (≤3 lines)

export function estimateEnhanceTokens(textChars: number, bulletCount: number): {
  input: number;
  output: number;
} {
  return {
    input: ESTIMATE_PROMPT_OVERHEAD_TOKENS + Math.ceil(textChars / ESTIMATE_CHARS_PER_TOKEN),
    output: ESTIMATE_SUMMARY_OUTPUT_TOKENS + bulletCount * ESTIMATE_OUTPUT_TOKENS_PER_BULLET,
  };
}

export interface GenerateInput {
  jdId: string;
  mode: GenMode;
  pageLimit: 1 | 2;
  // Optional: tailor against a persisted match analysis (its requirements
  // enrich scoring, and the resume records the link).
  analysisId?: string | null;
}

export class StaleAnalysisError extends Error {
  constructor() {
    super('The profile changed since this analysis ran — rerun it before generating');
    this.name = 'StaleAnalysisError';
  }
}

export class AnalysisIncompleteError extends Error {
  constructor() {
    super('The selected analysis is not completed');
    this.name = 'AnalysisIncompleteError';
  }
}

export class QuotaExceededError extends Error {
  constructor() {
    super('Monthly generation quota exceeded');
    this.name = 'QuotaExceededError';
  }
}

export class GenerationUnavailableError extends Error {
  constructor(reason: 'budget') {
    super(`Generation unavailable: ${reason}`);
    this.name = 'GenerationUnavailableError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export async function generateResume(
  deps: OrchestrateDeps,
  input: GenerateInput
): Promise<GeneratedResume> {
  const { supa, ai, now, user } = deps;
  const { jdId, mode, pageLimit, analysisId } = input;

  // 1. Check quota BEFORE any LLM call
  const usage = await currentUsage(supa, user.id, now);
  if (usage.generations >= GENERATIONS_CAP) {
    throw new QuotaExceededError();
  }

  // 2. Load profile, items, JD
  const profile = await getOrCreateProfile(supa, user.id);
  const items = await listItems(supa, profile.id);
  const jd = await getJd(supa, jdId);
  if (!jd) {
    throw new NotFoundError('not_found');
  }

  // 3. For enhance mode, check budget before LLM calls
  if (mode === 'enhance') {
    const currentMonth = monthKey(now);
    const currentCost = await globalLlmCost(supa, currentMonth);
    if (currentCost >= deps.monthlyCostCeilingMicros) {
      throw new GenerationUnavailableError('budget');
    }
  }

  // 4-7. The shared scoring+reserve+fit pipeline (buildFit, also used by the
  // live-refit + disposition recomputation so they can never drift):
  // career_snapshot excluded from scoring, and the page-space of the summary
  // text that ACTUALLY renders (pre-disposition: the snapshot verbatim in
  // both modes) reserved from the budget.
  // Optional analysis binding: must be the user's, completed, and fresh for
  // the profile as it reads NOW — a stale snapshot may not silently steer a
  // generation (spec §7.5 rerun-before-generate).
  let analysis: MatchAnalysis | null = null;
  if (analysisId) {
    analysis = await getAnalysis(supa, analysisId);
    if (!analysis || analysis.jdId !== jdId) throw new NotFoundError('not_found');
    if (analysis.status !== 'completed' || !analysis.result) throw new AnalysisIncompleteError();
    if (computeProfileFingerprint(items) !== analysis.profileFingerprint) throw new StaleAnalysisError();
  }

  const snapshotItem = items.find((item) => item.type === 'career_snapshot') ?? null;
  const { scored, fit: fitResult } = buildFit(
    items,
    // Tailoring follows the analyzed requirements when one is selected.
    analysis ? enrichmentFromAnalysis(jd.extraction, analysis.result!) : jd.extraction,
    pageLimit,
    snapshotItem?.canonicalText ?? null
  );

  // 5b. Determine early career (deps.now-injected for determinism)
  const earlyCareer = isEarlyCareer(items, now);

  // 6b. Order sections
  const sections = orderSections(scored, { earlyCareer });

  // 8. Build ResumeDoc
  const header: ResumeHeader = {
    fullName: profile.personal.fullName,
    email: profile.personal.email,
    phone: profile.personal.phone,
    location: profile.personal.location,
    links: profile.personal.links,
  };

  let summary: string | null = null;
  const suggestions: Suggestion[] = [];
  const statuses: SuggestionState[] = [];

  let enhanceTokens: { input: number; output: number } | null = null;

  if (mode === 'as_is') {
    // as-is: use career_snapshot verbatim (shared snapshotItem lookup)
    if (snapshotItem) {
      summary = snapshotItem.canonicalText;
    }
  } else {
    // Enhance mode: the doc carries ONLY original wording until a suggestion
    // is dispositioned (plan: suggestions "never part of doc until
    // dispositioned"). The composed headline therefore enters as a pending
    // summary suggestion, and doc.summary stays the snapshot's own text.
    // No snapshot → the summary is skipped, never fabricated (Review Focus 1)
    // — the composed text is derived from it, so composition is skipped too.
    const chosenItems = fitResult.chosen.map((s) => s.item);
    const snapshotText = snapshotItem?.canonicalText ?? '';
    summary = snapshotItem ? snapshotText : null;
    const facts = chosenItems.map((item) => item.canonicalText);

    const allSuggestions: Suggestion[] = [];

    if (snapshotItem) {
      const composed = await ai.composeSummary({
        jd: jd.extraction,
        snapshot: snapshotText,
        facts,
      });
      // The same no-invented-metrics rule as bullet rewrites, applied to the
      // composed headline: a figure absent from every input cannot ship.
      const evidence = `${snapshotText} ${facts.join(' ')}`;
      const clean = normalizeManualText(composed);
      allSuggestions.push(
        hasUnsupportedNumbers(clean, evidence)
          ? {
              id: 'summary-composed',
              targetItemId: snapshotItem.id,
              kind: 'summary',
              newText: snapshotText,
              basis: 'Composition added a number none of your inputs contain — kept your own summary. Add the figure to your profile if it is real, or edit to supply wording you stand behind.',
            }
          : {
              id: 'summary-composed',
              targetItemId: snapshotItem.id,
              kind: 'summary',
              newText: clean,
              basis: 'Headline composed from your career summary and this job — the summary itself is untouched.',
            }
      );
    }

    // Call ai.enhance for chosen bullets
    const enhanceSuggestions = await ai.enhance({
      jd: jd.extraction,
      items: chosenItems.map((item) => ({ itemId: item.id, text: item.canonicalText })),
    });
    allSuggestions.push(...enhanceSuggestions);

    for (const sug of allSuggestions) {
      suggestions.push(sug);
      statuses.push({
        suggestion: sug,
        status: 'pending',
        finalText: null,
      });
    }

    // Size the estimate to what we actually sent (shared by both calls'
    // prompts: the item texts + snapshot).
    const textChars =
      snapshotText.length +
      chosenItems.reduce((n, item) => n + item.canonicalText.length + 1, 0);
    enhanceTokens = estimateEnhanceTokens(textChars, chosenItems.length);
  }

  // Build sections with only chosen items and override basis to source profile item id
  const chosenItemIds = new Set(fitResult.chosen.map((s) => s.item.id));

  // Skill grouping: payload category (user-authored) always wins; enhance
  // mode fills the gaps with one cheap AI pass. as_is stays zero-LLM-call, so
  // no grouping there. Failures degrade to the flat block — this is
  // presentation, never content.
  const categoryByItemId = new Map<string, string>();
  const chosenSkills = fitResult.chosen.filter((s) => s.item.type === 'skill');
  const skillName = (s: (typeof chosenSkills)[number]): string =>
    typeof s.item.payload.name === 'string' && s.item.payload.name.trim() !== ''
      ? s.item.payload.name.trim()
      : s.item.canonicalText.trim();
  const needsAi: typeof chosenSkills = [];
  for (const s of chosenSkills) {
    const c = s.item.payload.category;
    if (typeof c === 'string' && c.trim() !== '') categoryByItemId.set(s.item.id, c.trim());
    else needsAi.push(s);
  }
  if (mode === 'enhance' && needsAi.length > 0) {
    const names = [...new Set(needsAi.map(skillName).filter((n) => n !== ''))];
    try {
      const groups = await ai.groupSkills(names);
      const byName = new Map<string, string>();
      for (const g of groups) for (const n of g.skills) byName.set(n, g.category);
      for (const s of needsAi) {
        const cat = byName.get(skillName(s));
        if (cat) categoryByItemId.set(s.item.id, cat);
      }
    } catch {
      // grouping unavailable — flat skills block is the fallback
    }
  }

  const seenSkillText = new Set<string>();
  const docSections: ResumeSection[] = sections
    .map((section) => {
      let items = section.items
        .filter((item) => chosenItemIds.has(item.sourceItemId))
        .map((item) => ({
          ...item,
          basis: item.sourceItemId, // Override basis to source profile item id
        }));
      if (section.id === 'skills') {
        // Drop empty and exact-duplicate entries; attach presentation categories.
        items = items
          .filter((item) => {
            const key = item.text.trim().toLowerCase();
            if (key === '' || seenSkillText.has(key)) return false;
            seenSkillText.add(key);
            return true;
          })
          .map((item) => {
            const cat = categoryByItemId.get(item.sourceItemId);
            return cat ? { ...item, category: cat } : item;
          });
      }
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);

  const doc: ResumeDoc = {
    header,
    summary,
    sections: docSections,
  };

  // 9. Record quota + spend BEFORE persistence. In enhance mode the LLM money
  // is already spent by the time we get here; if saveResume then fails, the
  // spend and the generation count must still be on the books, or the global
  // budget guard under-counts and retries look cheaper than they are.
  const costMicros = enhanceTokens
    ? estimateCostMicros(deps.enhanceModel, enhanceTokens)
    : 0; // as-is runs zero LLM calls — record no spend
  await recordGeneration(supa, costMicros);

  // 10. Save resume
  const fit: FitResultSnapshot = snapshotOf(fitResult);
  const resume = await saveResume(supa, user.id, {
    jdId,
    mode,
    pageLimit,
    doc,
    suggestions,
    statuses,
    userEdits: {},
    fit,
    analysisId: analysisId ?? null,
  });

  return resume;
}
