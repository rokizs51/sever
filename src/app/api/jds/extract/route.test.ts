import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeGenAI } from '@/lib/ai/fake';
import { JdNotParseableError } from '@/lib/ai/types';
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
  estimateCostMicros: vi.fn(() => 100),
}));

// Keep the real quota helpers (globalLlmCost/monthKey run against the stub);
// spy on the ledger write.
vi.mock('@/lib/db/quota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/quota')>();
  return { ...actual, recordGeneration: vi.fn() };
});

import { POST } from './route';
import { getSessionUser } from '@/lib/auth/session';
import { createRouteClient } from '@/lib/db/client';
import { createGenAI } from '@/lib/ai/client';
import { aiConfig } from '@/lib/ai/env';
import { recordGeneration } from '@/lib/db/quota';

const mockGetSessionUser = vi.mocked(getSessionUser);
const mockCreateRouteClient = vi.mocked(createRouteClient);
const mockCreateGenAI = vi.mocked(createGenAI);
const mockAiConfig = vi.mocked(aiConfig);
const mockRecordGeneration = vi.mocked(recordGeneration);

describe('POST /api/jds/extract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: any) => {
    return new Request('http://localhost:3000/api/jds/extract', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  };

  it('returns 401 when not authenticated', async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const response = await POST(createRequest({ raw: 'Valid job description text'.repeat(10) }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe('unauthorized');
  });

  it('returns 400 too_short when raw.trim().length < 80', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });

    const shortText = 'Short text';
    const response = await POST(createRequest({ raw: shortText }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('too_short');
  });

  it('returns 400 budget_exhausted when global LLM cost exceeds ceiling', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'claude-3-5-sonnet-20241022',
      enhanceModel: 'claude-3-5-sonnet-20241022',
      monthlyCostCeilingMicros: 1000,
    });

    const supa = createSupaStub({
      rpc: {
        month_llm_cost: { data: 2000, error: null },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as any);

    const validText = 'A'.repeat(100);
    const response = await POST(createRequest({ raw: validText }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('budget_exhausted');
  });

  it('returns 400 not_a_job_description when extractJd throws JdNotParseableError', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'claude-3-5-sonnet-20241022',
      enhanceModel: 'claude-3-5-sonnet-20241022',
      monthlyCostCeilingMicros: 1000000,
    });

    const supa = createSupaStub({
      rpc: {
        month_llm_cost: { data: 0, error: null },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as any);

    const fakeGenAI = makeFakeGenAI({
      async extractJd() {
        throw new JdNotParseableError('Failed to parse job description after retry');
      },
    });
    mockCreateGenAI.mockReturnValue(fakeGenAI);

    const validText = 'A'.repeat(100);
    const response = await POST(createRequest({ raw: validText }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('not_a_job_description');
    expect(data.error.message).toContain('Could not parse this as a valid job description');
  });

  it('returns 500 on unknown error', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'claude-3-5-sonnet-20241022',
      enhanceModel: 'claude-3-5-sonnet-20241022',
      monthlyCostCeilingMicros: 1000000,
    });

    const supa = createSupaStub({
      rpc: {
        month_llm_cost: { data: 0, error: null },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as any);

    const fakeGenAI = makeFakeGenAI({
      async extractJd() {
        throw new Error('Unknown error');
      },
    });
    mockCreateGenAI.mockReturnValue(fakeGenAI);

    const validText = 'A'.repeat(100);
    const response = await POST(createRequest({ raw: validText }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error.code).toBe('internal_error');
  });

  it('returns 200 with jdId and extraction on success', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'claude-3-5-sonnet-20241022',
      enhanceModel: 'claude-3-5-sonnet-20241022',
      monthlyCostCeilingMicros: 1000000,
    });

    const supa = createSupaStub({
      rpc: {
        month_llm_cost: { data: 0, error: null },
      },
      from: {
        job_descriptions: {
          data: {
            id: 'jd-123',
            owner: 'user-1',
            raw: 'Valid job description',
            extraction: {
              requiredSkills: ['TypeScript'],
              preferredSkills: ['React'],
              keywords: ['frontend'],
              seniority: 'mid',
              domain: 'software',
              tools: ['VS Code'],
              responsibilities: ['Build UI'],
            },
            created_at: '2026-10-17T00:00:00Z',
          },
          error: null,
        },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as any);

    const fakeGenAI = makeFakeGenAI();
    mockCreateGenAI.mockReturnValue(fakeGenAI);

    const validText = 'We are looking for a TypeScript developer with React experience.'.repeat(3);
    const response = await POST(createRequest({ raw: validText }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jdId).toBe('jd-123');
    expect(data.extraction).toBeDefined();
    expect(data.extraction.requiredSkills).toContain('TypeScript');
    expect(fakeGenAI.calls.extractJd).toHaveLength(1);
    expect(supa.calls.from.length).toBeGreaterThan(0);
    // spend-only ledger entry: cost recorded, no generation consumed (P0-3)
    expect(mockRecordGeneration).toHaveBeenCalledWith(supa, 100, 0);
  });

  it('returns 400 too_long when raw exceeds the character cap', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });

    const response = await POST(createRequest({ raw: 'A'.repeat(40_001) }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('too_long');
    expect(mockRecordGeneration).not.toHaveBeenCalled();
  });

  // Review Focus 2: junk inputs produce typed 400
  it('returns 400 not_a_job_description for one-word junk input', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'claude-3-5-sonnet-20241022',
      enhanceModel: 'claude-3-5-sonnet-20241022',
      monthlyCostCeilingMicros: 1000000,
    });

    const supa = createSupaStub({
      rpc: {
        month_llm_cost: { data: 0, error: null },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as any);

    const fakeGenAI = makeFakeGenAI({
      async extractJd() {
        throw new JdNotParseableError('Failed to parse job description after retry');
      },
    });
    mockCreateGenAI.mockReturnValue(fakeGenAI);

    // One-word junk (padded to pass length check)
    const oneWord = 'Hello '.repeat(20);
    const response = await POST(createRequest({ raw: oneWord }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('not_a_job_description');
  });

  it('returns 400 not_a_job_description for emoji soup input', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'claude-3-5-sonnet-20241022',
      enhanceModel: 'claude-3-5-sonnet-20241022',
      monthlyCostCeilingMicros: 1000000,
    });

    const supa = createSupaStub({
      rpc: {
        month_llm_cost: { data: 0, error: null },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as any);

    const fakeGenAI = makeFakeGenAI({
      async extractJd() {
        throw new JdNotParseableError('Failed to parse job description after retry');
      },
    });
    mockCreateGenAI.mockReturnValue(fakeGenAI);

    // Emoji soup (padded to pass length check)
    const emojiSoup = '😀🎉🚀💻'.repeat(25); // taste-skill-ignore: adversarial input under test, not UI
    const response = await POST(createRequest({ raw: emojiSoup }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe('not_a_job_description');
  });
});
