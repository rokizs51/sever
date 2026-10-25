// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeGenAI } from '@/lib/ai/fake';
import { CvNotParseableError } from '@/lib/ai/types';
import { createSupaStub } from '@/test-helpers/supa-stub';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({})),
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
  estimateCostMicros: vi.fn(() => 7),
}));

vi.mock('@/lib/import/pdf', () => ({
  extractPdfText: vi.fn(),
}));

vi.mock('@/lib/db/quota', () => ({
  globalLlmCost: vi.fn(),
  recordGeneration: vi.fn(),
  monthKey: vi.fn(() => '2026-10'),
}));

import { POST } from './route';
import { getSessionUser } from '@/lib/auth/session';
import { createRouteClient } from '@/lib/db/client';
import { createGenAI } from '@/lib/ai/client';
import { aiConfig } from '@/lib/ai/env';
import { extractPdfText } from '@/lib/import/pdf';
import { globalLlmCost, recordGeneration } from '@/lib/db/quota';

const mockGetSessionUser = vi.mocked(getSessionUser);
const mockCreateRouteClient = vi.mocked(createRouteClient);
const mockCreateGenAI = vi.mocked(createGenAI);
const mockAiConfig = vi.mocked(aiConfig);
const mockExtractPdfText = vi.mocked(extractPdfText);
const mockGlobalLlmCost = vi.mocked(globalLlmCost);
const mockRecordGeneration = vi.mocked(recordGeneration);

const draft = {
  personal: { fullName: '', email: '', phone: '', location: '', links: [] },
  summary: null,
  experience: [],
  projects: [],
  education: [],
  certifications: [],
  awards: [],
  skills: [{ name: 'React', level: '' }],
  languages: [],
};

const longCv = 'Alexandra Chen. Senior front-end engineer with seven years building design systems. '.repeat(3);

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/profile/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function pdfRequest(content = '%PDF-1.4 fake pdf bytes') {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'application/pdf' }), 'cv.pdf');
  return new Request('http://localhost/api/profile/import', {
    method: 'POST',
    body: form,
  });
}

describe('POST /api/profile/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockCreateRouteClient.mockResolvedValue(createSupaStub() as never);
    mockCreateGenAI.mockReturnValue(makeFakeGenAI({ extractCv: async () => draft }));
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'cheap-model',
      enhanceModel: 'strong-model',
      monthlyCostCeilingMicros: 2_000_000,
    });
    mockGlobalLlmCost.mockResolvedValue(0);
    mockRecordGeneration.mockResolvedValue(undefined);
    mockExtractPdfText.mockResolvedValue(longCv);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const response = await POST(jsonRequest({ text: longCv }));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('unauthorized');
  });

  it('returns 400 too_short for a tiny paste', async () => {
    const response = await POST(jsonRequest({ text: 'short' }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('too_short');
  });

  it('reads a pasted CV into a draft without writing items', async () => {
    const response = await POST(jsonRequest({ text: longCv }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.draft.items).toHaveLength(1);
    expect(data.draft.items[0].type).toBe('skill');
    // Spend-only ledger entry: generation count must stay at 0.
    expect(mockRecordGeneration).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.any(Number),
      expect.any(Date),
      0
    );
  });

  it('returns budget_exhausted before spending on the model', async () => {
    mockAiConfig.mockReturnValue({
      provider: 'anthropic',
      extractionModel: 'cheap-model',
      enhanceModel: 'strong-model',
      monthlyCostCeilingMicros: 1000,
    });
    mockGlobalLlmCost.mockResolvedValue(2000);

    const response = await POST(jsonRequest({ text: longCv }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('budget_exhausted');
    expect(mockCreateGenAI).not.toHaveBeenCalled();
  });

  it('returns not_a_cv when the model output stays unparseable', async () => {
    mockCreateGenAI.mockReturnValue(
      makeFakeGenAI({
        extractCv: async () => {
          throw new CvNotParseableError();
        },
      })
    );

    const response = await POST(jsonRequest({ text: longCv }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('not_a_cv');
  });

  it('extracts text from an uploaded PDF', async () => {
    const response = await POST(pdfRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockExtractPdfText).toHaveBeenCalled();
    expect(data.draft.items).toHaveLength(1);
  });

  it('rejects a PDF with no selectable text', async () => {
    mockExtractPdfText.mockResolvedValue('   ');

    const response = await POST(pdfRequest());

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('pdf_no_text');
  });

  it('rejects a file that is not a PDF', async () => {
    const response = await POST(pdfRequest('not a pdf'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('not_a_pdf');
    expect(mockExtractPdfText).not.toHaveBeenCalled();
  });
});