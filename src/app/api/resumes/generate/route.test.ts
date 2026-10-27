import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeGenAI } from '@/lib/ai/fake';
import { createSupaStub } from '@/test-helpers/supa-stub';

// Mock dependencies before importing route
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  createRouteClient: vi.fn(),
}));

vi.mock('@/lib/ai/client', () => ({
  createGenAI: vi.fn(),
}));

vi.mock('@/lib/ai/env', () => ({
  aiConfig: vi.fn(),
}));

import { POST } from './route';
import { getSessionUser } from '@/lib/auth/session';
import { createRouteClient } from '@/lib/db/client';
import { createGenAI } from '@/lib/ai/client';
import { aiConfig } from '@/lib/ai/env';

const mockGetSessionUser = vi.mocked(getSessionUser);
const mockCreateRouteClient = vi.mocked(createRouteClient);
const mockCreateGenAI = vi.mocked(createGenAI);
const mockAiConfig = vi.mocked(aiConfig);

describe('POST /api/resumes/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: any) => {
    return new Request('http://localhost:3000/api/resumes/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  };

  it('returns 401 when not authenticated', async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const response = await POST(createRequest({ jdId: 'jd-1', mode: 'as_is', pageLimit: 1 }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe('unauthorized');
  });

  it('returns 404 not_found when jdId not found', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'claude-3-5-sonnet-20241022',
      enhanceModel: 'claude-3-5-sonnet-20241022',
      monthlyCostCeilingMicros: 1000000,
    });

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
      rpc: {
        month_llm_cost: { data: 0, error: null },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as any);

    const fakeGenAI = makeFakeGenAI();
    mockCreateGenAI.mockReturnValue(fakeGenAI);

    const response = await POST(
      createRequest({ jdId: 'nonexistent-jd', mode: 'as_is', pageLimit: 1 })
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error.code).toBe('not_found');
  });

  it('returns 429 quota when 51st generation attempted', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'claude-3-5-sonnet-20241022',
      enhanceModel: 'claude-3-5-sonnet-20241022',
      monthlyCostCeilingMicros: 1000000,
    });

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
        job_descriptions: {
          data: {
            id: 'jd-1',
            owner: 'user-1',
            raw: 'Job description',
            extraction: {
              requiredSkills: ['TypeScript'],
              preferredSkills: ['React'],
              keywords: ['frontend'],
              seniority: 'mid',
              domain: 'software',
              tools: ['VS Code'],
              responsibilities: ['Build UI'],
            },
            created_at: '2026-10-15T00:00:00Z',
          },
          error: null,
        },
        generation_quota: {
          data: { generations: 50, llm_cost_micros: 0 },
          error: null,
        },
      },
      rpc: {
        month_llm_cost: { data: 0, error: null },
        // The cap is enforced by the atomic reservation (migration 0008).
        reserve_generation: {
          data: null,
          error: { code: 'QT429', message: 'monthly generation cap reached' },
        },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as any);

    const fakeGenAI = makeFakeGenAI();
    mockCreateGenAI.mockReturnValue(fakeGenAI);

    const response = await POST(
      createRequest({ jdId: 'jd-1', mode: 'enhance', pageLimit: 1 })
    );
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error.code).toBe('quota');
    // LLM should not be called
    expect(fakeGenAI.calls.enhance.length).toBe(0);
    expect(fakeGenAI.calls.composeSummary.length).toBe(0);
  });

  it('returns 400 budget_exhausted when budget exceeded in enhance mode', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'claude-3-5-sonnet-20241022',
      enhanceModel: 'claude-3-5-sonnet-20241022',
      monthlyCostCeilingMicros: 1000,
    });

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
        job_descriptions: {
          data: {
            id: 'jd-1',
            owner: 'user-1',
            raw: 'Job description',
            extraction: {
              requiredSkills: ['TypeScript'],
              preferredSkills: ['React'],
              keywords: ['frontend'],
              seniority: 'mid',
              domain: 'software',
              tools: ['VS Code'],
              responsibilities: ['Build UI'],
            },
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
        month_llm_cost: { data: 2000, error: null },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as any);

    const fakeGenAI = makeFakeGenAI();
    mockCreateGenAI.mockReturnValue(fakeGenAI);

    const response = await POST(
      createRequest({ jdId: 'jd-1', mode: 'enhance', pageLimit: 1 })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('budget_exhausted');
  });

  it('returns 201 with resume on successful as-is generation', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'claude-3-5-sonnet-20241022',
      enhanceModel: 'claude-3-5-sonnet-20241022',
      monthlyCostCeilingMicros: 1000000,
    });

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
        profile_items: {
          data: [
            {
              id: 'item-1',
              profile_id: 'profile-1',
              type: 'experience',
              payload: {},
              canonical_text: 'Built React apps with TypeScript',
              source: 'manual',
              provenance: [],
              pinned: false,
              position: 0,
            },
          ],
          error: null,
        },
        job_descriptions: {
          data: {
            id: 'jd-1',
            owner: 'user-1',
            raw: 'Job description',
            extraction: {
              requiredSkills: ['TypeScript'],
              preferredSkills: ['React'],
              keywords: ['frontend'],
              seniority: 'mid',
              domain: 'software',
              tools: ['VS Code'],
              responsibilities: ['Build UI'],
            },
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
        month_llm_cost: { data: 0, error: null },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as any);

    const fakeGenAI = makeFakeGenAI();
    mockCreateGenAI.mockReturnValue(fakeGenAI);

    const response = await POST(
      createRequest({ jdId: 'jd-1', mode: 'as_is', pageLimit: 1 })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.resume).toBeDefined();
    expect(data.resume.id).toBe('resume-1');
    // As-is makes zero LLM calls
    expect(fakeGenAI.calls.extractJd.length).toBe(0);
    expect(fakeGenAI.calls.enhance.length).toBe(0);
    expect(fakeGenAI.calls.composeSummary.length).toBe(0);
  });

  it('returns 409 stale_analysis when the profile moved past the analysis fingerprint', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'claude-sonnet-20241022',
      enhanceModel: 'claude-sonnet-20241022',
      monthlyCostCeilingMicros: 1000000,
    });

    const supa = createSupaStub({
      from: {
        profiles: {
          data: { id: 'profile-1', user_id: 'user-1', personal: { fullName: 'T', email: 't@example.com', phone: null, location: null, links: [] } },
          error: null,
        },
        profile_items: { data: [], error: null },
        job_descriptions: {
          data: { id: 'jd-1', owner: 'user-1', raw: 'x', extraction: { requiredSkills: [], preferredSkills: [], keywords: [], seniority: 'mid', domain: 'd', tools: [], responsibilities: [] }, created_at: '2026-10-18T00:00:00Z' },
          error: null,
        },
        generation_quota: { data: { generations: 0, llm_cost_micros: 0 }, error: null },
        match_analyses: {
          data: {
            id: 'a-1', owner: 'user-1', jd_id: 'jd-1', status: 'completed',
            result: {
              requirements: [], matches: [],
              summary: {
                totals: { requirements: 0, supported: 0, partial: 0, needs_review: 0, not_established: 0, not_applicable: 0 },
                byImportance: { mandatory: {}, preferred: {} },
                strongest: [], gaps: [], questions: [], adjustments: [],
              },
            },
            error: null,
            profile_fingerprint: 'fingerprint-of-an-older-profile',
            created_at: '2026-10-18T00:00:00Z',
            updated_at: '2026-10-18T00:00:00Z',
          },
          error: null,
        },
      },
      rpc: { month_llm_cost: { data: 0, error: null } },
    });
    mockCreateRouteClient.mockResolvedValue(supa as any);
    mockCreateGenAI.mockReturnValue(makeFakeGenAI());

    const response = await POST(
      createRequest({ jdId: 'jd-1', mode: 'as_is', pageLimit: 1, analysisId: 'a-1' })
    );
    const data = await response.json();

    // empty items ⇒ live fingerprint is hash of '' ≠ stored one ⇒ stale
    expect(response.status).toBe(409);
    expect(data.error.code).toBe('stale_analysis');
  });
});
