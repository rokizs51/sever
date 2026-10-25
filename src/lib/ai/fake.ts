import type { GenAI, EnhanceRequest, SummaryRequest, SkillGroup } from './types';
import type { JdExtraction, Suggestion } from '@/lib/domain/types';
import type { CvImportDraft } from '@/lib/domain/cv-import';
import type { MatchAnalysisRequest, MatchAnalysisModelOutput } from '@/lib/match/match-types';

/**
 * Call recorder for fake GenAI - tracks all invocations for test assertions.
 */
export interface FakeGenAICalls {
  extractJd: string[];
  enhance: EnhanceRequest[];
  composeSummary: SummaryRequest[];
  groupSkills: string[][];
  analyzeMatch: MatchAnalysisRequest[];
  extractCv: string[];
}

/**
 * Fake GenAI with call recording for testing.
 */
export interface FakeGenAI extends GenAI {
  calls: FakeGenAICalls;
}

/**
 * Default CV draft for tests.
 */
const defaultCvDraft: CvImportDraft = {
  personal: { fullName: '', email: '', phone: '', location: '', links: [] },
  summary: null,
  experience: [],
  projects: [],
  education: [],
  certifications: [],
  awards: [],
  skills: [],
  languages: [],
};

/**
 * Default extraction result for tests.
 */
const defaultExtraction: JdExtraction = {
  requiredSkills: ['TypeScript', 'React'],
  preferredSkills: ['Next.js'],
  keywords: ['frontend', 'web development'],
  seniority: 'mid',
  domain: 'software',
  tools: ['VS Code', 'Git'],
  responsibilities: ['Build UI components', 'Write tests'],
};

/**
 * Creates a fake GenAI provider for testing.
 * Records all calls and returns configurable responses.
 */
export function makeFakeGenAI(overrides?: Partial<GenAI>): FakeGenAI {
  const calls: FakeGenAICalls = {
    extractJd: [],
    enhance: [],
    composeSummary: [],
    groupSkills: [],
    analyzeMatch: [],
    extractCv: [],
  };

  return {
    calls,

    async extractJd(jdText: string): Promise<JdExtraction> {
      calls.extractJd.push(jdText);
      if (overrides?.extractJd) {
        return overrides.extractJd(jdText);
      }
      return defaultExtraction;
    },

    async enhance(req: EnhanceRequest): Promise<Suggestion[]> {
      calls.enhance.push(req);
      if (overrides?.enhance) {
        return overrides.enhance(req);
      }
      // Return empty suggestions by default
      return [];
    },

    async composeSummary(req: SummaryRequest): Promise<string> {
      calls.composeSummary.push(req);
      if (overrides?.composeSummary) {
        return overrides.composeSummary(req);
      }
      return 'Test summary';
    },

    async groupSkills(names: string[]): Promise<SkillGroup[]> {
      calls.groupSkills.push(names);
      if (overrides?.groupSkills) {
        return overrides.groupSkills(names);
      }
      // Default: no grouping — consumers treat it as a flat skills block.
      return [];
    },

    async extractCv(cvText: string): Promise<CvImportDraft> {
      calls.extractCv.push(cvText);
      if (overrides?.extractCv) {
        return overrides.extractCv(cvText);
      }
      return defaultCvDraft;
    },

    async analyzeMatch(req: MatchAnalysisRequest): Promise<MatchAnalysisModelOutput> {
      calls.analyzeMatch.push(req);
      if (overrides?.analyzeMatch) {
        return overrides.analyzeMatch(req);
      }
      // Default: every requirement marked not_established with no evidence —
      // the most conservative honest answer; tests override per scenario.
      return {
        matches: req.requirements.map((r) => ({
          requirementId: r.id,
          status: 'not_established' as const,
          confidence: 'high' as const,
          evidenceRefs: [],
          explanation: 'No profile record addresses this requirement (fake analysis).',
        })),
      };
    },
  };
}
