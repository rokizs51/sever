import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateText } from 'ai';

// Partial mock: keep real error classes (instanceof checks in
// isSchemaParseError depend on them), stub only the model call.
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateText: vi.fn() };
});
import { JSONParseError, TypeValidationError, NoObjectGeneratedError } from 'ai';
import { isSchemaParseError, preserveHeaderLines, hasUnsupportedNumbers, sanitizeSuggestions, finalizeRequirements, finalizeGroups } from './client';

describe('isSchemaParseError', () => {
  it('returns true for JSONParseError', () => {
    const error = new JSONParseError({ text: 'invalid json', cause: new Error('Parse failed') });
    expect(isSchemaParseError(error)).toBe(true);
  });

  it('returns true for TypeValidationError', () => {
    const error = new TypeValidationError({
      cause: new Error('validation failed'),
      value: {},
    });
    expect(isSchemaParseError(error)).toBe(true);
  });

  it('returns true for NoObjectGeneratedError', () => {
    // This constructor demands SDK-internal response/usage/finishReason objects;
    // the test only checks instanceof-based classification, so create a real
    // instance without coupling the test to those internals.
    const error = Object.create(NoObjectGeneratedError.prototype) as NoObjectGeneratedError;
    expect(isSchemaParseError(error)).toBe(true);
  });

  it('returns false for generic Error', () => {
    const error = new Error('Network error');
    expect(isSchemaParseError(error)).toBe(false);
  });

  it('returns false for APICallError', () => {
    const error = new Error('Rate limit exceeded');
    expect(isSchemaParseError(error)).toBe(false);
  });

  it('returns false for unknown error types', () => {
    expect(isSchemaParseError('string error')).toBe(false);
    expect(isSchemaParseError(null)).toBe(false);
    expect(isSchemaParseError(undefined)).toBe(false);
    expect(isSchemaParseError({ message: 'fake error' })).toBe(false);
  });
});

describe('preserveHeaderLines', () => {
  const items = [{ itemId: 'e1', text: 'Dev — Acme (2022–2023)\n• built X\n• led Y' }];

  it('restores the title line when the rewrite drops it', () => {
    const out = preserveHeaderLines(
      [{ targetItemId: 'e1', newText: 'Engineered X and led Y at Acme' }],
      items
    );
    expect(out[0].newText).toBe('Dev — Acme (2022–2023)\nEngineered X and led Y at Acme');
  });

  it('leaves a rewrite that kept the title line untouched', () => {
    const kept = 'Dev — Acme (2022–2023)\n• Engineered X';
    const out = preserveHeaderLines([{ targetItemId: 'e1', newText: kept }], items);
    expect(out[0].newText).toBe(kept);
  });

  it('single-line items (skills, projects) pass through unchanged', () => {
    const out = preserveHeaderLines(
      [{ targetItemId: 's1', newText: 'Go (Advanced)' }],
      [{ itemId: 's1', text: 'Go' }]
    );
    expect(out[0].newText).toBe('Go (Advanced)');
  });
});

describe('hasUnsupportedNumbers', () => {
  it('allows numbers already present in the source, flags invented ones', () => {
    expect(hasUnsupportedNumbers('Cut 3 queues by 40%', 'Automated 3 queues')).toBe(true);
    expect(hasUnsupportedNumbers('Cut latency across 3 queues', 'Automated 3 queues')).toBe(false);
    expect(hasUnsupportedNumbers('2.5x throughput', 'grew 2.5x')).toBe(false);
    expect(hasUnsupportedNumbers('2,500 users', 'served 2,500 users')).toBe(false);
  });
});

describe('sanitizeSuggestions', () => {
  const items = [{ itemId: 'e1', text: 'Dev — Acme (2022–2023)\nBuilt X' }];

  it('drops suggestions targeting item ids the model invented', () => {
    const out = sanitizeSuggestions(
      [{ id: 's0', targetItemId: 'ghost', kind: 'bullet', newText: 'Did Z', basis: 'b' }],
      items
    );
    expect(out).toEqual([]);
  });

  it('downgrades an invented metric to the user wording with an evidence ask', () => {
    const out = sanitizeSuggestions(
      [{ id: 's0', targetItemId: 'e1', kind: 'bullet', newText: 'Boosted X by 300%', basis: 'b' }],
      items
    );
    expect(out[0].newText).toBe('Dev — Acme (2022–2023)\nBuilt X');
    expect(out[0].basis).toMatch(/number your entry does not contain/);
  });

  it('downgrades banned puffery (inflected forms too) to the user wording', () => {
    const out = sanitizeSuggestions(
      [{ id: 's0', targetItemId: 'e1', kind: 'bullet', newText: 'Leveraged robust pipelines', basis: 'b' }],
      items
    );
    expect(out[0].newText).toBe('Dev — Acme (2022–2023)\nBuilt X');
    expect(out[0].basis).toMatch(/puffery/);
  });

  it('strips stacked bullet markers from accepted wording', () => {
    const out = sanitizeSuggestions(
      [{ id: 's0', targetItemId: 'e1', kind: 'bullet', newText: 'Dev — Acme (2022–2023)\n• - Built X', basis: 'b' }],
      items
    );
    expect(out[0].newText).toBe('Dev — Acme (2022–2023)\nBuilt X');
  });
});

describe('finalizeRequirements', () => {
  const jdRaw = 'We need someone with deep PostgreSQL experience and strong communication skills.';

  it('assigns deterministic ids and dedupes case/whitespace-identical descriptions', () => {
    const out = finalizeRequirements(
      [
        { description: 'PostgreSQL', category: 'technical_skill', importance: 'mandatory', aliases: ['postgreSQL'], sourceExcerpt: null },
        { description: ' postgresql ', category: 'technical_skill', importance: 'preferred', aliases: [], sourceExcerpt: null },
        { description: 'Communication', category: 'communication', importance: 'mandatory', aliases: [], sourceExcerpt: null },
      ],
      jdRaw
    );
    expect(out.map((r) => r.id)).toEqual(['req-technical_skill-0', 'req-communication-1']);
    expect(out[0].aliases).toEqual(['postgreSQL']);
  });

  it('keeps only sourceExcerpts verbatim-findable in the JD', () => {
    const out = finalizeRequirements(
      [
        { description: 'PostgreSQL', category: 'technical_skill', importance: 'mandatory', aliases: [], sourceExcerpt: 'deep PostgreSQL experience' },
        { description: 'Kafka', category: 'technical_skill', importance: 'mandatory', aliases: [], sourceExcerpt: 'Kafka pipelines we never mentioned' },
      ],
      jdRaw
    );
    expect(out[0].sourceExcerpt).toBe('deep PostgreSQL experience');
    expect(out[1].sourceExcerpt).toBe(null);
  });
});

describe('preserveHeaderLines marker-blind compare', () => {
  it('treats a reprinted "• Role — Co" first line as the kept header', () => {
    const items = [{ itemId: 'e1', text: 'Dev — Acme (2022–2023)\nBuilt X' }];
    const out = preserveHeaderLines(
      [{ targetItemId: 'e1', newText: '• Dev — Acme (2022–2023)\nEngineered Y' }],
      items
    );
    expect(out[0].newText).toBe('• Dev — Acme (2022–2023)\nEngineered Y');
  });
});

describe('finalizeGroups', () => {
  it('drops hallucinated and duplicated names, coerces unknown labels, sweeps unclaimed ones into the fallback group', () => {
    const out = finalizeGroups(
      ['Go', 'Rust', 'Kubernetes'],
      [
        { category: 'Programming languages', skills: ['Go', 'Go', 'TypeScript'] },
        { category: '  ', skills: ['Rust'] },
      ]
    );
    expect(out).toEqual([
      { category: 'Programming languages', skills: ['Go'] },
      { category: 'Other relevant skills', skills: ['Rust'] },
      { category: 'Other relevant skills', skills: ['Kubernetes'] },
    ]);
  });
});

describe('structured-output retry policy (real createGenAI, stubbed transport)', () => {
  afterEach(() => {
    vi.mocked(generateText).mockReset();
    delete process.env.AI_MODEL_EXTRACTION;
    delete process.env.AI_MODEL_ENHANCE;
  });

  function env() {
    process.env.AI_MODEL_EXTRACTION = 'claude-test-extract';
    process.env.AI_MODEL_ENHANCE = 'claude-test-enhance';
    process.env.AI_API_KEY = 'test-key';
  }

  it('enhance retries malformed output once, then fails with a typed error — never a silent pass', async () => {
    env();
    const { createGenAI } = await import('./client');
    const ai = createGenAI();
    vi.mocked(generateText).mockResolvedValue({ text: 'I could not comply.' } as never);

    await expect(
      ai.enhance({
        jd: { requiredSkills: [], preferredSkills: [], keywords: [], seniority: 'mid', domain: 'd', tools: [], responsibilities: [] },
        items: [{ itemId: 'e1', text: 'Dev — Acme\nBuilt X' }],
      })
    ).rejects.toThrow(/unusable after retry/);
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('analyzeMatch retries once then throws AnalysisNotParseableError (no partial completed state possible)', async () => {
    env();
    const { createGenAI } = await import('./client');
    const { AnalysisNotParseableError } = await import('./types');
    const ai = createGenAI();
    vi.mocked(generateText).mockResolvedValue({ text: '{ "matches": "not an array" }' } as never);

    await expect(
      ai.analyzeMatch({
        requirements: [
          { id: 'req-technical_skill-0', description: 'Go', category: 'technical_skill', importance: 'mandatory', aliases: [], sourceExcerpt: null },
        ],
        items: [{ itemId: 'e1', type: 'experience', text: 'Dev — Acme\nBuilt X' }],
      })
    ).rejects.toBeInstanceOf(AnalysisNotParseableError);
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('a valid second attempt passes — one hiccup does not fail the analysis', async () => {
    env();
    const { createGenAI } = await import('./client');
    const ai = createGenAI();
    vi.mocked(generateText)
      .mockResolvedValueOnce({ text: 'oops not json' } as never)
      .mockResolvedValueOnce({
        text: '{"matches":[{"requirementId":"req-technical_skill-0","status":"supported","confidence":"high","evidenceRefs":[{"itemId":"e1","sourceType":"experience"}],"explanation":"Stated directly."}]}',
      } as never);

    const out = await ai.analyzeMatch({
      requirements: [
        { id: 'req-technical_skill-0', description: 'Go', category: 'technical_skill', importance: 'mandatory', aliases: [], sourceExcerpt: null },
      ],
      items: [{ itemId: 'e1', type: 'experience', text: 'Dev — Acme\nBuilt X in Go' }],
    });
    expect(out.matches[0].status).toBe('supported');
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('extractCv retries malformed output once, then fails with CvNotParseableError', async () => {
    env();
    const { createGenAI } = await import('./client');
    const { CvNotParseableError } = await import('./types');
    const ai = createGenAI();
    vi.mocked(generateText).mockResolvedValue({ text: 'I could not comply.' } as never);

    await expect(ai.extractCv('Alex Chen — Senior Engineer')).rejects.toBeInstanceOf(
      CvNotParseableError
    );
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('extractCv applies the lenient draft defaults to a valid response', async () => {
    env();
    const { createGenAI } = await import('./client');
    const ai = createGenAI();
    vi.mocked(generateText).mockResolvedValue({
      text: '{"personal":{"fullName":"Alex","phone":null},"experience":[{"company":"Acme","role":"Dev","start":"Mar 2022","end":"Present","bullets":["• Shipped X"]}],"skills":[{"name":"React"}]}',
    } as never);

    const out = await ai.extractCv('Alex Chen — Senior Engineer');

    expect(out.personal.fullName).toBe('Alex');
    expect(out.personal.phone).toBe('');
    expect(out.experience[0].company).toBe('Acme');
    expect(out.experience[0].technologies).toEqual([]);
    expect(out.skills[0].name).toBe('React');
    expect(out.projects).toEqual([]);
  });
});
