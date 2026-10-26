import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateResume,
  QuotaExceededError,
  GenerationUnavailableError,
  NotFoundError,
  StaleAnalysisError,
  AnalysisIncompleteError,
} from './orchestrate';
import type { OrchestrateDeps, GenerateInput } from './orchestrate';
import { makeFakeGenAI } from '@/lib/ai/fake';
import { createSupaStub } from '@/test-helpers/supa-stub';
import { computeProfileFingerprint } from '@/lib/match/analyze';
import type { ProfileItem, JdExtraction } from '@/lib/domain/types';
import type { PersonalInfo } from '@/lib/db/profiles';
import type { SupabaseClient } from '@supabase/supabase-js';

function makeItem(overrides: Partial<ProfileItem> & { id: string; type: ProfileItem['type'] }): ProfileItem {
  return {
    profileId: 'profile-1',
    payload: {},
    canonicalText: '',
    source: 'manual',
    provenance: [],
    pinned: false,
    position: 0,
    ...overrides,
  };
}

// The test double (SupaStub) deliberately does not structurally satisfy
// SupabaseClient; callers pass the stub (to inspect .calls) and it is cast
// once at the deps boundary.
function makeDeps(
  overrides?: Partial<Omit<OrchestrateDeps, 'supa'>> & { supa?: unknown }
): OrchestrateDeps {
  const { supa, ...rest } = overrides ?? {};
  return {
    supa: (supa ?? createSupaStub()) as unknown as SupabaseClient,
    ai: makeFakeGenAI(),
    now: new Date('2026-10-15'),
    user: { id: 'user-1', email: 'test@example.com' },
    enhanceModel: 'claude-sonnet-test',
    monthlyCostCeilingMicros: 1000000,
    ...rest,
  };
}

const defaultExtraction: JdExtraction = {
  requiredSkills: ['TypeScript', 'React'],
  preferredSkills: ['Next.js'],
  keywords: ['frontend'],
  seniority: 'mid',
  domain: 'software',
  tools: ['VS Code'],
  responsibilities: ['Build UI'],
};

function configureSupaForGeneration(
  profileId: string,
  items: ProfileItem[],
  jdExtraction: JdExtraction,
  generations: number = 0
) {
  return createSupaStub({
    from: {
      profiles: {
        data: {
          id: profileId,
          user_id: 'user-1',
          personal: {
            fullName: 'Test User',
            email: 'test@example.com',
            phone: null,
            location: null,
            links: [],
          } as PersonalInfo,
        },
        error: null,
      },
      profile_items: {
        data: items.map((item) => ({
          id: item.id,
          profile_id: item.profileId,
          type: item.type,
          payload: item.payload,
          canonical_text: item.canonicalText,
          source: item.source,
          provenance: item.provenance,
          pinned: item.pinned,
          position: item.position,
        })),
        error: null,
      },
      job_descriptions: {
        data: {
          id: 'jd-1',
          owner: 'user-1',
          raw: 'Job description text',
          extraction: jdExtraction,
          created_at: '2026-10-15T00:00:00Z',
        },
        error: null,
      },
      generation_quota: {
        data: { generations, llm_cost_micros: 0 },
        error: null,
      },
      generated_resumes: {
        data: {
          id: 'resume-1',
          owner: 'user-1',
          jd_id: 'jd-1',
          mode: 'as_is',
          page_limit: 1,
          doc: {},
          suggestions: [],
          statuses: [],
          user_edits: {},
          fit: { chosen: [], cuts: [], overflow: false },
          created_at: '2026-10-15T00:00:00Z',
          updated_at: '2026-10-15T00:00:00Z',
        },
        error: null,
      },
    },
  });
}

describe('orchestrate.ts', () => {
  describe('as-is mode', () => {
    it('makes ZERO LLM calls and doc contains canonicalText verbatim', async () => {
      const ai = makeFakeGenAI();
      const items = [
        makeItem({
          id: 'item-1',
          type: 'experience',
          canonicalText: 'Built React apps with TypeScript',
        }),
      ];
      
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa, ai });
      const input: GenerateInput = {
        jdId: 'jd-1',
        mode: 'as_is',
        pageLimit: 1,
      };

      const result = await generateResume(deps, input);

      // Zero LLM calls
      expect(ai.calls.extractJd.length).toBe(0);
      expect(ai.calls.enhance.length).toBe(0);
      expect(ai.calls.composeSummary.length).toBe(0);

      // Doc contains canonicalText verbatim
      const expSection = result.doc.sections.find((s) => s.id === 'experience');
      expect(expSection).toBeDefined();
      expect(expSection!.items[0].text).toBe('Built React apps with TypeScript');
    });

    it('attaches typed entry fields from the profile payload', async () => {
      const ai = makeFakeGenAI();
      const items = [
        makeItem({
          id: 'exp-1',
          type: 'experience',
          canonicalText: 'Engineer — Acme (2022–2024)\nBuilt X',
          payload: {
            company: 'Acme',
            role: 'Engineer',
            start: '2022',
            end: '2024',
            bullets: ['Built X'],
            technologies: ['Go'],
          },
        }),
      ];

      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa, ai });
      const result = await generateResume(deps, { jdId: 'jd-1', mode: 'as_is', pageLimit: 1 });

      const expSection = result.doc.sections.find((s) => s.id === 'experience');
      expect(expSection!.items[0].header).toEqual({
        title: 'Engineer',
        company: 'Acme',
        dates: '2022–2024',
      });
      expect(expSection!.items[0].bullets).toEqual(['Built X']);
      expect(expSection!.items[0].technologies).toEqual(['Go']);
    });

    it('uses career_snapshot verbatim as summary when present', async () => {
      const ai = makeFakeGenAI();
      const items = [
        makeItem({
          id: 'snapshot-1',
          type: 'career_snapshot',
          canonicalText: 'Experienced frontend developer',
          payload: { text: 'Experienced frontend developer' },
        }),
      ];
      
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa, ai });
      const input: GenerateInput = {
        jdId: 'jd-1',
        mode: 'as_is',
        pageLimit: 1,
      };

      const result = await generateResume(deps, input);

      expect(result.doc.summary).toBe('Experienced frontend developer');
      expect(ai.calls.composeSummary.length).toBe(0);
    });

    it('pinned career_snapshot appears ONLY as summary, never as a section item', async () => {
      // The dual-appearance bug: a *pinned* snapshot would be force-kept by the
      // fit engine and surface in sections under the 'summary' id. The scored
      // pipeline now excludes career_snapshot entirely, so it appears once.
      const items = [
        makeItem({
          id: 'snapshot-1',
          type: 'career_snapshot',
          canonicalText: 'Backend engineer, 3 yrs fintech',
          payload: { text: 'Backend engineer, 3 yrs fintech' },
          pinned: true,
        }),
        makeItem({
          id: 'item-1',
          type: 'experience',
          canonicalText: 'Built React apps with TypeScript',
        }),
      ];

      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa });
      const result = await generateResume(deps, {
        jdId: 'jd-1',
        mode: 'as_is',
        pageLimit: 1,
      });

      // Expressed exactly once, as the top-level summary.
      expect(result.doc.summary).toBe('Backend engineer, 3 yrs fintech');
      // Never as a section.
      const summarySection = result.doc.sections.find((s) => s.id === 'summary');
      expect(summarySection).toBeUndefined();
      const allSectionItemIds = result.doc.sections.flatMap((s) => s.items.map((i) => i.sourceItemId));
      expect(allSectionItemIds).not.toContain('snapshot-1');
    });

    it('omits summary section when career_snapshot missing', async () => {
      const items = [
        makeItem({
          id: 'item-1',
          type: 'experience',
          canonicalText: 'Built React apps',
        }),
      ];
      
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa });
      const input: GenerateInput = {
        jdId: 'jd-1',
        mode: 'as_is',
        pageLimit: 1,
      };

      const result = await generateResume(deps, input);

      expect(result.doc.summary).toBeNull();
    });

    it('omits awards section when no awards present', async () => {
      const items = [
        makeItem({
          id: 'item-1',
          type: 'experience',
          canonicalText: 'Built React apps',
        }),
      ];
      
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa });
      const input: GenerateInput = {
        jdId: 'jd-1',
        mode: 'as_is',
        pageLimit: 1,
      };

      const result = await generateResume(deps, input);

      const awardsSection = result.doc.sections.find((s) => s.id === 'awards');
      expect(awardsSection).toBeUndefined();
    });
  });

  describe('enhance mode', () => {
    it('calls ai.enhance and ai.composeSummary', async () => {
      const ai = makeFakeGenAI({
        enhance: async () => [
          {
            id: 'sug-1',
            targetItemId: 'item-1',
            kind: 'bullet',
            newText: 'Enhanced bullet text',
            basis: 'item-1',
          },
        ],
        composeSummary: async () => 'Enhanced summary',
      });
      
      const items = [
        makeItem({
          id: 'item-1',
          type: 'experience',
          canonicalText: 'Built React apps',
        }),
        makeItem({
          id: 'snapshot-1',
          type: 'career_snapshot',
          canonicalText: 'Original snapshot',
          payload: { text: 'Original snapshot' },
        }),
      ];
      
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa, ai });
      const input: GenerateInput = {
        jdId: 'jd-1',
        mode: 'enhance',
        pageLimit: 1,
      };

      const result = await generateResume(deps, input);

      expect(ai.calls.enhance.length).toBe(1);
      expect(ai.calls.composeSummary.length).toBe(1);
      // Doc carries ONLY original wording pre-disposition; the composed text
      // exists solely as a pending summary suggestion (plan Task 10/13 rule).
      expect(result.doc.summary).toBe('Original snapshot');
      const summaryState = result.statuses.find((s) => s.suggestion.kind === 'summary');
      expect(summaryState).toBeDefined();
      expect(summaryState?.status).toBe('pending');
      expect(summaryState?.suggestion.newText).toBe('Enhanced summary');
    });

    it('enhance with no career_snapshot: summary skipped, never fabricated', async () => {
      const ai = makeFakeGenAI();
      const items = [
        makeItem({ id: 'item-1', type: 'experience', canonicalText: 'Built React apps with TypeScript' }),
      ];

      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa, ai });

      const result = await generateResume(deps, { jdId: 'jd-1', mode: 'enhance', pageLimit: 1 });

      expect(ai.calls.composeSummary.length).toBe(0);
      expect(ai.calls.enhance.length).toBe(1);
      expect(result.doc.summary).toBeNull();
      expect(result.statuses.some((s) => s.suggestion.kind === 'summary')).toBe(false);
    });

    it('stores suggestions with status pending', async () => {
      const ai = makeFakeGenAI({
        enhance: async () => [
          {
            id: 'sug-1',
            targetItemId: 'item-1',
            kind: 'bullet',
            newText: 'Enhanced bullet',
            basis: 'item-1',
          },
        ],
      });
      
      const items = [
        makeItem({
          id: 'item-1',
          type: 'experience',
          canonicalText: 'Built React apps',
        }),
      ];
      
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa, ai });
      const input: GenerateInput = {
        jdId: 'jd-1',
        mode: 'enhance',
        pageLimit: 1,
      };

      const result = await generateResume(deps, input);

      expect(result.statuses.length).toBeGreaterThan(0);
      expect(result.statuses[0].status).toBe('pending');
    });

    it('doc contains original bullets only, not suggestions', async () => {
      const ai = makeFakeGenAI({
        enhance: async () => [
          {
            id: 'sug-1',
            targetItemId: 'item-1',
            kind: 'bullet',
            newText: 'Enhanced bullet text',
            basis: 'item-1',
          },
        ],
      });
      
      const items = [
        makeItem({
          id: 'item-1',
          type: 'experience',
          canonicalText: 'Original bullet text with TypeScript React',
        }),
      ];
      
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa, ai });
      const input: GenerateInput = {
        jdId: 'jd-1',
        mode: 'enhance',
        pageLimit: 1,
      };

      const result = await generateResume(deps, input);

      const expSection = result.doc.sections.find((s) => s.id === 'experience');
      expect(expSection).toBeDefined();
      expect(expSection!.items[0].text).toBe('Original bullet text with TypeScript React');
      expect(expSection!.items[0].text).not.toBe('Enhanced bullet text');
    });
  });

  describe('quota boundary', () => {
    it('allows 50th generation (at cap)', async () => {
      const items = [
        makeItem({
          id: 'item-1',
          type: 'experience',
          canonicalText: 'Built React apps',
        }),
      ];
      
      // 49 generations already used, so this is the 50th
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction, 49);
      const deps = makeDeps({ supa });
      const input: GenerateInput = {
        jdId: 'jd-1',
        mode: 'as_is',
        pageLimit: 1,
      };

      const result = await generateResume(deps, input);
      expect(result).toBeDefined();
    });

    it('throws QuotaExceededError on 51st generation BEFORE LLM call', async () => {
      const ai = makeFakeGenAI();
      const items = [
        makeItem({
          id: 'item-1',
          type: 'experience',
          canonicalText: 'Built React apps',
        }),
      ];
      
      // 50 generations already used, so this would be the 51st
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction, 50);
      const deps = makeDeps({ supa, ai });
      const input: GenerateInput = {
        jdId: 'jd-1',
        mode: 'enhance',
        pageLimit: 1,
      };

      await expect(generateResume(deps, input)).rejects.toThrow(QuotaExceededError);
      
      // Fake AI calls should be empty (quota check happens before LLM)
      expect(ai.calls.extractJd.length).toBe(0);
      expect(ai.calls.enhance.length).toBe(0);
      expect(ai.calls.composeSummary.length).toBe(0);
    });
  });

  describe('budget guard', () => {
    it('throws GenerationUnavailableError when budget exhausted in enhance mode', async () => {
      const ai = makeFakeGenAI();
      const items = [
        makeItem({
          id: 'item-1',
          type: 'experience',
          canonicalText: 'Built React apps',
        }),
      ];
      
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      // Override rpc to simulate budget exceeded
      const budgetSupa = createSupaStub({
        from: {
          profiles: {
            data: {
              id: 'profile-1',
              user_id: 'user-1',
              personal: {
                fullName: 'Test User',
                email: 'test@example.com',
                phone: null,
                location: null,
                links: [],
              },
            },
            error: null,
          },
          profile_items: {
            data: items.map((item) => ({
              id: item.id,
              profile_id: item.profileId,
              type: item.type,
              payload: item.payload,
              canonical_text: item.canonicalText,
              source: item.source,
              provenance: item.provenance,
              pinned: item.pinned,
              position: item.position,
            })),
            error: null,
          },
          job_descriptions: {
            data: {
              id: 'jd-1',
              owner: 'user-1',
              raw: 'Job description',
              extraction: defaultExtraction,
              created_at: '2026-10-15T00:00:00Z',
            },
            error: null,
          },
          generation_quota: {
            data: { generations: 0, llm_cost_micros: 0 },
            error: null,
          },
        },
        rpc: {
          month_llm_cost: {
            data: 100000000, // 100M micros = $100, way over typical ceiling
            error: null,
          },
        },
      });
      
      const deps = makeDeps({ supa: budgetSupa, ai });
      const input: GenerateInput = {
        jdId: 'jd-1',
        mode: 'enhance',
        pageLimit: 1,
      };

      await expect(generateResume(deps, input)).rejects.toThrow(GenerationUnavailableError);
    });

    it('allows as-is mode even when budget exhausted', async () => {
      const items = [
        makeItem({
          id: 'item-1',
          type: 'experience',
          canonicalText: 'Built React apps',
        }),
      ];
      
      const budgetSupa = createSupaStub({
        from: {
          profiles: {
            data: {
              id: 'profile-1',
              user_id: 'user-1',
              personal: {
                fullName: 'Test User',
                email: 'test@example.com',
                phone: null,
                location: null,
                links: [],
              },
            },
            error: null,
          },
          profile_items: {
            data: items.map((item) => ({
              id: item.id,
              profile_id: item.profileId,
              type: item.type,
              payload: item.payload,
              canonical_text: item.canonicalText,
              source: item.source,
              provenance: item.provenance,
              pinned: item.pinned,
              position: item.position,
            })),
            error: null,
          },
          job_descriptions: {
            data: {
              id: 'jd-1',
              owner: 'user-1',
              raw: 'Job description',
              extraction: defaultExtraction,
              created_at: '2026-10-15T00:00:00Z',
            },
            error: null,
          },
          generation_quota: {
            data: { generations: 0, llm_cost_micros: 0 },
            error: null,
          },
          generated_resumes: {
            data: {
              id: 'resume-1',
              owner: 'user-1',
              jd_id: 'jd-1',
              mode: 'as_is',
              page_limit: 1,
              doc: {},
              suggestions: [],
              statuses: [],
              user_edits: {},
              fit: { chosen: [], cuts: [], overflow: false },
              created_at: '2026-10-15T00:00:00Z',
              updated_at: '2026-10-15T00:00:00Z',
            },
            error: null,
          },
        },
        rpc: {
          month_llm_cost: {
            data: 100000000,
            error: null,
          },
        },
      });
      
      const deps = makeDeps({ supa: budgetSupa });
      const input: GenerateInput = {
        jdId: 'jd-1',
        mode: 'as_is',
        pageLimit: 1,
      };

      const result = await generateResume(deps, input);
      expect(result).toBeDefined();
    });
  });

  describe('error cases', () => {
    it('throws when jdId not found', async () => {
      const supa = createSupaStub({
        from: {
          profiles: {
            data: {
              id: 'profile-1',
              user_id: 'user-1',
              personal: {
                fullName: 'Test User',
                email: 'test@example.com',
                phone: null,
                location: null,
                links: [],
              },
            },
            error: null,
          },
          profile_items: { data: [], error: null },
          job_descriptions: { data: null, error: { code: 'PGRST116' } },
        },
      });
      
      const deps = makeDeps({ supa });
      const input: GenerateInput = {
        jdId: 'nonexistent-jd',
        mode: 'as_is',
        pageLimit: 1,
      };

      await expect(generateResume(deps, input)).rejects.toThrow('not_found');
    });
  });

  describe('cost recording', () => {
    const savedPricing = process.env.PRICING_JSON;
    afterEach(() => {
      if (savedPricing === undefined) delete process.env.PRICING_JSON;
      else process.env.PRICING_JSON = savedPricing;
    });

    it('as-is records zero cost (no LLM ran)', async () => {
      const items = [
        makeItem({ id: 'item-1', type: 'experience', canonicalText: 'Built React apps with TypeScript' }),
      ];
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa });
      await generateResume(deps, { jdId: 'jd-1', mode: 'as_is', pageLimit: 1 });

      const call = supa.calls.rpc.find((c) => c.fn === 'record_usage');
      expect(call?.params.p_cost).toBe(0);
    });

    it('enhance records cost estimated from deps.enhanceModel, not a hardcoded literal', async () => {
      // Pricing keyed by the injected model. If the code still used the old
      // hardcoded 'claude-3-5-sonnet-20241022', the lookup would miss → 0.
      process.env.PRICING_JSON = JSON.stringify({
        'claude-sonnet-test': { input: 3, output: 15 },
      });
      const text = 'Built React apps with TypeScript'; // 32 chars
      const items = [
        makeItem({ id: 'item-1', type: 'experience', canonicalText: text }),
      ];
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa });
      await generateResume(deps, { jdId: 'jd-1', mode: 'enhance', pageLimit: 1 });

      const call = supa.calls.rpc.find((c) => c.fn === 'record_usage');
      // input = 800 + ceil(33/4) = 809 (32 chars + 1 join)
      // output = 150 + 1*80 = 230
      // 809*3 + 230*15 = 2427 + 3450 = 5877
      expect(call?.params.p_cost).toBe(5877);
    });
  });

  describe('summary page-space', () => {
    it('as-is: a long snapshot reserves lines so bullets get space-cut instead of spilling', async () => {
      // Snapshot of 76*64 chars = 76 estimated lines of a 78-unit page.
      const snapshotText = 'x'.repeat(76 * 64);
      const bullets = 'React ' + 'y'.repeat(4 * 64 - 6); // keyword-bearing, 4 lines — fits rawly, not after the reserve
      const items = [
        makeItem({ id: 'snap-1', type: 'career_snapshot', canonicalText: snapshotText }),
        makeItem({ id: 'exp-1', type: 'experience', canonicalText: bullets }),
      ];
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa });
      const result = await generateResume(deps, { jdId: 'jd-1', mode: 'as_is', pageLimit: 1 });

      expect(result.doc.summary).toBe(snapshotText);
      // The bullet must be cut for space (2 units left after the 76-unit reserve).
      expect(result.fit.cuts).toEqual(
        expect.arrayContaining([expect.objectContaining({ itemId: 'exp-1', reason: 'space' })])
      );
      expect(result.fit.chosen).not.toContain('exp-1');
    });

    it('pinned content overflow is reported honestly when the snapshot reserve tips it over', async () => {
      const snapshotText = 'z'.repeat(5 * 64); // 5-unit reserve
      const items = [
        makeItem({ id: 'snap-1', type: 'career_snapshot', canonicalText: snapshotText }),
        makeItem({
          id: 'pin-1',
          type: 'experience',
          canonicalText: 'React ' + 'w'.repeat(75 * 64 - 6), // 75 units: fits 78 rawly, not 78-5
          pinned: true,
        }),
      ];
      const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
      const deps = makeDeps({ supa });
      const result = await generateResume(deps, { jdId: 'jd-1', mode: 'as_is', pageLimit: 1 });

      expect(result.fit.overflow).toBe(true);
      // pinned is never dropped
      expect(result.fit.chosen).toContain('pin-1');
    });
  });
});

describe('skill cleanup and grouping (Task §4)', () => {
  function skill(id: string, text: string, payload: Record<string, unknown> = {}) {
    return makeItem({ id, type: 'skill', canonicalText: text, payload });
  }
  const snapshot = () =>
    makeItem({
      id: 'snap',
      type: 'career_snapshot',
      canonicalText: 'Backend engineer',
      payload: { text: 'Backend engineer' },
    });

  it('enhance: dedupes exact-duplicate and empty skills, attaches AI categories', async () => {
    const ai = makeFakeGenAI({
      groupSkills: async (names) => [{ category: 'Languages', skills: names }],
    });
    const items = [
      snapshot(),
      skill('s1', 'Go', { name: 'Go' }),
      skill('s2', 'Go', { name: 'Go' }), // exact duplicate
      skill('s3', '   '), // empty
      skill('s4', 'Rust', { name: 'Rust' }),
    ];
    const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
    const result = await generateResume(makeDeps({ supa, ai }), { jdId: 'jd-1', mode: 'enhance', pageLimit: 1 });

    const skills = result.doc.sections.find((s) => s.id === 'skills')!;
    expect(skills.items.map((i) => i.text)).toEqual(['Go', 'Rust']);
    expect(skills.items.map((i) => i.category)).toEqual(['Languages', 'Languages']);
    expect(ai.calls.groupSkills).toEqual([['Go', 'Rust']]);
  });

  it('enhance: a payload category wins and only uncategorized names reach the AI', async () => {
    const ai = makeFakeGenAI({
      groupSkills: async (names) => [{ category: 'Databases', skills: names }],
    });
    const items = [
      snapshot(),
      skill('s1', 'Postgres', { name: 'Postgres', category: 'Databases' }),
      skill('s2', 'React', { name: 'React' }),
    ];
    const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
    const result = await generateResume(makeDeps({ supa, ai }), { jdId: 'jd-1', mode: 'enhance', pageLimit: 1 });

    const skills = result.doc.sections.find((s) => s.id === 'skills')!;
    expect(ai.calls.groupSkills).toEqual([['React']]);
    expect(skills.items.find((i) => i.text === 'Postgres')!.category).toBe('Databases');
    expect(skills.items.find((i) => i.text === 'React')!.category).toBe('Databases');
  });

  it('as_is: grouping is never invoked (zero-LLM guarantee) and skills stay flat', async () => {
    const ai = makeFakeGenAI();
    const items = [snapshot(), skill('s1', 'Go', { name: 'Go' }), skill('s2', 'Go', { name: 'Go' })];
    const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
    const result = await generateResume(makeDeps({ supa, ai }), { jdId: 'jd-1', mode: 'as_is', pageLimit: 1 });

    expect(ai.calls.groupSkills.length).toBe(0);
    const skills = result.doc.sections.find((s) => s.id === 'skills')!;
    expect(skills.items.map((i) => i.text)).toEqual(['Go']); // dedup still applies — cleanup is not AI
    expect(skills.items[0].category).toBeUndefined();
  });

  it('a composed headline carrying an unsupported number becomes an evidence ask', async () => {
    const ai = makeFakeGenAI({ composeSummary: async () => 'Led 300 engineers' });
    const items = [
      snapshot(),
      makeItem({ id: 'e1', type: 'experience', canonicalText: 'Built APIs' }),
    ];
    const supa = configureSupaForGeneration('profile-1', items, defaultExtraction);
    const result = await generateResume(makeDeps({ supa, ai }), { jdId: 'jd-1', mode: 'enhance', pageLimit: 1 });

    const summary = result.statuses.find((s) => s.suggestion.kind === 'summary')!;
    expect(summary.suggestion.newText).toBe('Backend engineer');
    expect(summary.suggestion.basis).toMatch(/number none of your inputs contain/);
  });
});

describe('generate bound to a match analysis', () => {
  function analysisRow(items: ProfileItem[], over: Record<string, unknown> = {}) {
    return {
      id: 'jd-1' in over ? 'a-1' : 'a-1',
      owner: 'user-1',
      jd_id: 'jd-1',
      status: 'completed',
      result: {
        requirements: [],
        matches: [],
        summary: {
          totals: { requirements: 0, supported: 0, partial: 0, needs_review: 0, not_established: 0, not_applicable: 0 },
          byImportance: { mandatory: {}, preferred: {} },
          strongest: [], gaps: [], questions: [], adjustments: [],
        },
      },
      error: null,
      profile_fingerprint: computeProfileFingerprint(items),
      created_at: '2026-10-15T00:00:00Z',
      updated_at: '2026-10-15T00:00:00Z',
      ...over,
    };
  }

  function supaWith(items: ProfileItem[], analysisData: unknown) {
    return createSupaStub({
      from: {
        profiles: {
          data: { id: 'profile-1', user_id: 'user-1', personal: { fullName: 'T', email: 't@example.com', phone: null, location: null, links: [] } },
          error: null,
        },
        profile_items: {
          data: items.map((i) => ({
            id: i.id, profile_id: i.profileId, type: i.type, payload: i.payload,
            canonical_text: i.canonicalText, source: i.source, provenance: i.provenance,
            pinned: i.pinned, position: i.position,
          })),
          error: null,
        },
        job_descriptions: {
          data: { id: 'jd-1', owner: 'user-1', raw: 'raw', extraction: defaultExtraction, created_at: '2026-10-15T00:00:00Z' },
          error: null,
        },
        generation_quota: { data: { generations: 0, llm_cost_micros: 0 }, error: null },
        match_analyses: { data: analysisData, error: null },
      },
      rpc: { month_llm_cost: { data: 0, error: null } },
    });
  }

  it('refuses to generate from a STALE analysis — profile edits win over snapshots', async () => {
    const items = [makeItem({ id: 'e1', type: 'experience', canonicalText: 'Built React apps with TypeScript' })];
    const stale = analysisRow(items, { profile_fingerprint: 'old-fingerprint' });
    const ai = makeFakeGenAI();
    const deps = makeDeps({ supa: supaWith(items, stale), ai });

    await expect(
      generateResume(deps, { jdId: 'jd-1', mode: 'as_is', pageLimit: 1, analysisId: 'a-1' })
    ).rejects.toThrow(StaleAnalysisError);
    expect(ai.calls.enhance.length).toBe(0);
  });

  it('refuses an analysis that never completed', async () => {
    const items = [makeItem({ id: 'e1', type: 'experience', canonicalText: 'Built React apps with TypeScript' })];
    const deps = makeDeps({ supa: supaWith(items, analysisRow(items, { status: 'running', result: null })) });

    await expect(
      generateResume(deps, { jdId: 'jd-1', mode: 'as_is', pageLimit: 1, analysisId: 'a-1' })
    ).rejects.toThrow(AnalysisIncompleteError);
  });

  it('a fresh completed analysis links onto the stored resume', async () => {
    const items = [makeItem({ id: 'e1', type: 'experience', canonicalText: 'Built React apps with TypeScript' })];
    const deps = makeDeps({ supa: supaWith(items, analysisRow(items)) });

    const resume = await generateResume(deps, { jdId: 'jd-1', mode: 'as_is', pageLimit: 1, analysisId: 'a-1' });
    expect(resume.analysisId).toBe('a-1');
  });

  it('an analysis id for another JD or absent (RLS null) is a 404 signal', async () => {
    const items = [makeItem({ id: 'e1', type: 'experience', canonicalText: 'Built React apps' })];
    const deps = makeDeps({ supa: supaWith(items, { ...analysisRow(items), jd_id: 'other-jd' }) });
    await expect(
      generateResume(deps, { jdId: 'jd-1', mode: 'as_is', pageLimit: 1, analysisId: 'a-1' })
    ).rejects.toThrow(NotFoundError);
  });
});
