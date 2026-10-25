import { describe, it, expect } from 'vitest';
import {
  CvImportDraftSchema,
  finalizeCvDraft,
  normalizeCvText,
  normalizeImportDate,
  normalizeImportEnd,
  parseImportYear,
} from './cv-import';

describe('CV import date helpers', () => {
  it('normalizes month names, slashes and short ISO dates', () => {
    expect(normalizeImportDate('Mar 2022')).toBe('2022-03');
    expect(normalizeImportDate('March 2022')).toBe('2022-03');
    expect(normalizeImportDate('3/2022')).toBe('2022-03');
    expect(normalizeImportDate('2022-3')).toBe('2022-03');
    expect(normalizeImportDate('2022')).toBe('2022');
  });

  it('passes through dates it does not recognize instead of guessing', () => {
    expect(normalizeImportDate('Spring 2022')).toBe('Spring 2022');
    expect(normalizeImportDate('')).toBe('');
  });

  it('stores present/current as an empty end date', () => {
    expect(normalizeImportEnd('Present')).toBe('');
    expect(normalizeImportEnd('current')).toBe('');
    expect(normalizeImportEnd('Mar 2022')).toBe('2022-03');
  });

  it('extracts a four-digit year from text or numbers', () => {
    expect(parseImportYear(2022)).toBe(2022);
    expect(parseImportYear('2022')).toBe(2022);
    expect(parseImportYear('Mar 2022')).toBe(2022);
    expect(parseImportYear('')).toBeNull();
    expect(parseImportYear(undefined)).toBeNull();
  });
});

describe('normalizeCvText', () => {
  it('normalizes line endings and collapses runs of blank lines', () => {
    expect(normalizeCvText('a\r\nb\r\n\r\n\r\nc\u0000')).toBe('a\nb\n\nc');
  });
});

describe('finalizeCvDraft', () => {
  const draft = CvImportDraftSchema.parse({
    personal: {
      fullName: ' Alex Chen ',
      email: 'alex@example.com',
      phone: '',
      location: 'San Francisco',
      links: ['https://github.com/alex', 'https://github.com/alex'],
    },
    summary: 'Senior front-end engineer.',
    experience: [
      {
        company: 'Meridian',
        role: 'Senior Engineer',
        start: 'Mar 2022',
        end: 'Present',
        bullets: ['• Built X', '• Built X', 'Cut latency 38%'],
        technologies: 'React, TypeScript',
      },
      { company: '', role: '', bullets: [] },
    ],
    projects: [{ name: 'Thing', description: 'Does it', tech: 'Go, Rust' }],
    education: [
      { school: 'TU Berlin', degree: 'BSc', field: 'CS', startYear: '2014', endYear: '2018' },
    ],
    certifications: [{ name: 'AWS', issuer: 'Amazon', year: '2024' }],
    awards: [{ title: 'Hackathon', issuer: 'X', year: 2023 }],
    skills: [{ name: 'React' }, { name: 'react' }, { name: 'Go', level: 'Advanced' }],
    languages: [{ name: 'English', level: 'fluent' }],
  });

  const result = finalizeCvDraft(draft);

  it('emits validated items in CV order and drops unusable entries', () => {
    expect(result.items.map((i) => i.type)).toEqual([
      'career_snapshot',
      'experience',
      'project',
      'education',
      'certification',
      'award',
      'skill',
      'skill',
      'language',
    ]);
    expect(result.warnings.join(' ')).toContain('Skipped 1 entry');
  });

  it('normalizes the experience header, dates and bullet markers', () => {
    const experience = result.items.find((i) => i.type === 'experience')!;
    expect(experience.canonicalText).toContain('Senior Engineer — Meridian (Mar 2022–present)');
    expect(experience.canonicalText).not.toContain('•');
    expect(experience.payload.bullets).toEqual(['Built X', 'Cut latency 38%']);
    expect(experience.payload.technologies).toEqual(['React', 'TypeScript']);
  });

  it('deduplicates skills case-insensitively and preserves a stated level', () => {
    const skills = result.items.filter((i) => i.type === 'skill');
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.payload.name)).toEqual(['React', 'Go']);
    expect(skills[1].payload.level).toBe('Advanced');
  });

  it('trims personal details and deduplicates links', () => {
    expect(result.personal.fullName).toBe('Alex Chen');
    expect(result.personal.phone).toBeNull();
    expect(result.personal.links).toEqual(['https://github.com/alex']);
  });
});

describe('finalizeCvDraft edge cases', () => {
  it('skips education without usable years instead of inventing them', () => {
    const result = finalizeCvDraft(
      CvImportDraftSchema.parse({
        education: [{ school: 'Somewhere', degree: 'BSc' }],
      })
    );
    expect(result.items).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('years were not clear');
  });

  it('does not create a summary item when the CV had none', () => {
    const result = finalizeCvDraft(CvImportDraftSchema.parse({ summary: null }));
    expect(result.items).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('skips certifications and awards without a year', () => {
    const result = finalizeCvDraft(
      CvImportDraftSchema.parse({
        certifications: [{ name: 'AWS' }],
        awards: [{ title: 'Hackathon' }],
      })
    );
    expect(result.items).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('certification');
    expect(result.warnings.join(' ')).toContain('award');
  });
});