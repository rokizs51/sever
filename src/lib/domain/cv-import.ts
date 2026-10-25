import { z } from 'zod';
import type { ItemType } from './types';
import { PAYLOAD_SCHEMAS } from './schemas';
import { canonicalTextFor, stripBullet } from './canonical';

/**
 * Model-facing schema for "read my existing CV". Deliberately lenient: the
 * model may omit keys, return numbers as strings, or split a list on commas.
 * Strict `PAYLOAD_SCHEMAS` validation happens in `finalizeCvDraft`, so one
 * malformed entry is dropped instead of failing the whole import.
 */

const looseString = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === null ? '' : String(v)));

const looseList = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return v.split(/[,;\n]/);
    return [];
  },
  z.array(looseString)
);

const looseYear = z.union([z.string(), z.number(), z.null()]).optional();

const CvExperienceSchema = z.object({
  company: looseString.default(''),
  role: looseString.default(''),
  start: looseString.default(''),
  end: looseString.default(''),
  location: looseString.default(''),
  employmentType: looseString.default(''),
  bullets: looseList.default([]),
  technologies: looseList.default([]),
});

const CvProjectSchema = z.object({
  name: looseString.default(''),
  description: looseString.default(''),
  tech: looseList.default([]),
});

const CvEducationSchema = z.object({
  school: looseString.default(''),
  degree: looseString.default(''),
  field: looseString.default(''),
  startYear: looseYear,
  endYear: looseYear,
});

const CvCertificationSchema = z.object({
  name: looseString.default(''),
  issuer: looseString.default(''),
  year: looseYear,
});

const CvAwardSchema = z.object({
  title: looseString.default(''),
  issuer: looseString.default(''),
  year: looseYear,
});

const CvSkillSchema = z.object({
  name: looseString.default(''),
  level: looseString.default(''),
});

const CvLanguageSchema = z.object({
  name: looseString.default(''),
  level: looseString.default(''),
});

export const CvImportDraftSchema = z.object({
  personal: z
    .object({
      fullName: looseString.default(''),
      email: looseString.default(''),
      phone: looseString.default(''),
      location: looseString.default(''),
      links: looseList.default([]),
    })
    .default({ fullName: '', email: '', phone: '', location: '', links: [] }),
  summary: z.union([z.string(), z.null()]).default(null),
  experience: z.array(CvExperienceSchema).default([]),
  projects: z.array(CvProjectSchema).default([]),
  education: z.array(CvEducationSchema).default([]),
  certifications: z.array(CvCertificationSchema).default([]),
  awards: z.array(CvAwardSchema).default([]),
  skills: z.array(CvSkillSchema).default([]),
  languages: z.array(CvLanguageSchema).default([]),
});

export type CvImportDraft = z.infer<typeof CvImportDraftSchema>;

export interface ImportedPersonal {
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  links: string[];
}

export interface ImportedItem {
  type: ItemType;
  payload: Record<string, unknown>;
  canonicalText: string;
}

export interface FinalizedCvImport {
  items: ImportedItem[];
  personal: ImportedPersonal;
  warnings: string[];
}

export const MAX_IMPORT_ITEMS = 150;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * "Mar 2022" / "3/2022" / "2022-3" → "2022-03". Anything already in the
 * app's canonical forms (YYYY, YYYY-MM) passes through, as does anything
 * unrecognized — never guess a date the CV didn't state.
 */
export function normalizeImportDate(value: string): string {
  const s = value.trim();
  if (s === '') return '';
  if (/^\d{4}$/.test(s)) return s;

  const iso = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (iso) {
    const m = Number(iso[2]);
    return m >= 1 && m <= 12 ? `${iso[1]}-${String(m).padStart(2, '0')}` : s;
  }

  const named = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s);
  if (named) {
    const m = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (m) return `${named[2]}-${String(m).padStart(2, '0')}`;
  }

  const slash = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) {
    const m = Number(slash[1]);
    if (m >= 1 && m <= 12) return `${slash[2]}-${String(m).padStart(2, '0')}`;
  }

  return s;
}

/** End dates: "present" is stored as empty, which the renderer reads as current. */
export function normalizeImportEnd(value: string): string {
  return /^(present|current|now|ongoing)$/i.test(value.trim()) ? '' : normalizeImportDate(value);
}

export function parseImportYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const m = /\d{4}/.exec(value);
    if (m) return Number(m[0]);
  }
  return null;
}

/** Collapse things a PDF extractor leaves behind; preserve line structure. */
export function normalizeCvText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const v = value.trim();
    if (v === '' || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Normalized identity for duplicate detection (shared with the commit route). */
export function importKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function keyOf(text: string): string {
  return importKey(text);
}

function nullable(value: string): string | null {
  const v = value.trim();
  return v === '' ? null : v;
}

/**
 * Model output → validated profile items. Every entry is checked against the
 * same strict schema the manual forms use; anything that cannot be represented
 * faithfully is dropped with a warning, never guessed into place.
 */
export function finalizeCvDraft(draft: CvImportDraft): FinalizedCvImport {
  const warnings: string[] = [];
  const items: ImportedItem[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  const push = (type: ItemType, payload: Record<string, unknown>): void => {
    const parsed = PAYLOAD_SCHEMAS[type].safeParse(payload);
    if (!parsed.success) {
      dropped++;
      return;
    }
    const canonicalText = canonicalTextFor(type, parsed.data);
    if (canonicalText.trim() === '') {
      dropped++;
      return;
    }
    const key = `${type}:${keyOf(canonicalText)}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ type, payload: parsed.data, canonicalText });
  };

  const summary = draft.summary?.trim() ?? '';
  if (summary) push('career_snapshot', { text: summary });

  for (const e of draft.experience) {
    const role = e.role.trim();
    const company = e.company.trim();
    if (!role && !company) {
      dropped++;
      continue;
    }
    const technologies = cleanList(e.technologies);
    push('experience', {
      company,
      role,
      start: normalizeImportDate(e.start),
      end: normalizeImportEnd(e.end),
      bullets: cleanList(e.bullets.map(stripBullet)),
      ...(e.location.trim() ? { location: e.location.trim() } : {}),
      ...(e.employmentType.trim() ? { employmentType: e.employmentType.trim() } : {}),
      ...(technologies.length > 0 ? { technologies } : {}),
    });
  }

  for (const p of draft.projects) {
    const name = p.name.trim();
    if (!name) {
      dropped++;
      continue;
    }
    push('project', {
      name,
      description: p.description.trim(),
      tech: cleanList(p.tech),
    });
  }

  for (const e of draft.education) {
    const school = e.school.trim();
    const degree = e.degree.trim();
    if (!school && !degree) {
      dropped++;
      continue;
    }
    const startYear = parseImportYear(e.startYear);
    const endYear = parseImportYear(e.endYear);
    if (startYear === null || endYear === null) {
      warnings.push(
        `Skipped an education entry (${school || degree}) — its years were not clear. Add it manually.`
      );
      continue;
    }
    push('education', { school, degree, field: e.field.trim(), startYear, endYear });
  }

  for (const c of draft.certifications) {
    const name = c.name.trim();
    if (!name) {
      dropped++;
      continue;
    }
    const year = parseImportYear(c.year);
    if (year === null) {
      warnings.push(`Skipped a certification (${name}) — its year was not clear. Add it manually.`);
      continue;
    }
    push('certification', { name, issuer: c.issuer.trim(), year });
  }

  for (const a of draft.awards) {
    const title = a.title.trim();
    if (!title) {
      dropped++;
      continue;
    }
    const year = parseImportYear(a.year);
    if (year === null) {
      warnings.push(`Skipped an award (${title}) — its year was not clear. Add it manually.`);
      continue;
    }
    push('award', { title, issuer: a.issuer.trim(), year });
  }

  for (const s of draft.skills) {
    const name = s.name.trim();
    if (!name) {
      dropped++;
      continue;
    }
    push('skill', { name, ...(s.level.trim() ? { level: s.level.trim() } : {}) });
  }

  for (const l of draft.languages) {
    const name = l.name.trim();
    if (!name) {
      dropped++;
      continue;
    }
    push('language', { name, level: l.level.trim() });
  }

  if (dropped > 0) {
    warnings.push(
      `Skipped ${dropped} ${dropped === 1 ? 'entry' : 'entries'} that could not be read reliably. Add them manually if they matter.`
    );
  }

  if (items.length > MAX_IMPORT_ITEMS) {
    warnings.push(`Only the first ${MAX_IMPORT_ITEMS} entries were kept. Add the rest manually.`);
    items.length = MAX_IMPORT_ITEMS;
  }

  return {
    items,
    personal: {
      fullName: draft.personal.fullName.trim(),
      email: draft.personal.email.trim(),
      phone: nullable(draft.personal.phone),
      location: nullable(draft.personal.location),
      links: cleanList(draft.personal.links),
    },
    warnings,
  };
}