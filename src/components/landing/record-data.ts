/**
 * Sample record used by the landing page's live sheet and proof columns.
 * Deliberate sample data (a believable person, items that add up); swap for
 * a real capture before launch if this page starts marketing with user data.
 */

export type Bullet = {
  id: string;
  text: string;
  company: string;
  period: string;
  tags: string[];
};

export const RECORD: Bullet[] = [
  { id: 'designsystem', text: 'Led the design-system rebuild across 4 product teams (React, TypeScript)', company: 'Meridian Health', period: 'since 2022', tags: ['React', 'TypeScript', 'design systems'] },
  { id: 'wcag', text: 'Shipped WCAG 2.2 AA on the patient portal', company: 'Meridian Health', period: 'since 2022', tags: ['accessibility', 'WCAG'] },
  { id: 'figma', text: 'Kept the Figma library in lockstep with code via Storybook', company: 'Meridian Health', period: 'since 2022', tags: ['Figma', 'Storybook'] },
  { id: 'mentor', text: 'Mentored 3 junior developers through onboarding', company: 'Meridian Health', period: 'since 2022', tags: [] },
  { id: 'graphql', text: 'Migrated the checkout API to GraphQL, −38% latency', company: 'Northline Studio', period: '2019 to 2022', tags: ['GraphQL'] },
  { id: 'k8s', text: 'Containerised 9 services on Kubernetes; cut build minutes 40%', company: 'Northline Studio', period: '2019 to 2022', tags: ['Kubernetes'] },
  { id: 'motion', text: 'Built the marketing site’s motion layer (GSAP, reduced-motion first)', company: 'Northline Studio', period: '2019 to 2022', tags: ['GSAP'] },
  { id: 'inventory', text: 'Ran quarterly hardware inventory audits', company: 'Northline Studio', period: '2019 to 2022', tags: [] },
  { id: 'payments', text: 'Rebuilt checkout retries, +2.1% completed payments', company: 'Freelance', period: '2018 to 2019', tags: [] },
];

/** The one enhancement the product proposes for this record (review stage). */
export const REWRITE = {
  id: 'designsystem',
  old: 'Worked on the design system',
};

export const STAGES = ['record', 'paste', 'tailor', 'review'] as const;
export type StageId = (typeof STAGES)[number];

export const STAGE_NAMES: Record<StageId, string> = {
  record: 'Your record',
  paste: 'The posting',
  tailor: 'Reordered',
  review: 'Your call',
};

export const CLAUSES: Record<StageId, { line: string; body: string }> = {
  record: {
    line: 'One record, kept current',
    body: 'Enter each job, project and skill once. Every item carries its source: the company, the dates, what you actually did.',
  },
  paste: {
    line: 'It reads the posting, not a template',
    body: 'Each job description is taken apart into what is required, preferred, the tools named and the words that carry weight, then matched line by line against your record.',
  },
  tailor: {
    line: 'The same bullets, in the right order',
    body: 'What this employer wants rises to the top. What does not belong is set aside with the reason, never deleted.',
  },
  review: {
    line: 'Nothing changes without you',
    body: 'A sharper sentence arrives as a proposal with its source attached. Accept one and it lands in the draft; refuse it and your words stand.',
  },
};

export type RoleId = 'frontend' | 'platform' | 'lead';

export const ROLES: Record<RoleId, {
  label: string;
  title: string;
  wants: string[];
  keep: string[];
  setAside: { id: string; reason: string }[];
}> = {
  frontend: {
    label: 'Frontend engineer',
    title: 'Senior frontend engineer',
    wants: ['React', 'TypeScript', 'design systems', 'accessibility', 'WCAG', 'Figma'],
    keep: ['designsystem', 'wcag', 'figma', 'motion'],
    setAside: [
      { id: 'k8s', reason: 'platform work, not asked for' },
      { id: 'inventory', reason: 'unrelated to this posting' },
    ],
  },
  platform: {
    label: 'Platform engineer',
    title: 'Platform engineer',
    wants: ['Kubernetes', 'GraphQL'],
    keep: ['k8s', 'graphql', 'payments', 'inventory'],
    setAside: [
      { id: 'figma', reason: 'frontend tooling, not asked for' },
      { id: 'motion', reason: 'frontend work, not asked for' },
    ],
  },
  lead: {
    label: 'Design-systems lead',
    title: 'Design-systems lead',
    wants: ['design systems', 'Led', 'Mentored', 'WCAG'],
    keep: ['designsystem', 'mentor', 'wcag', 'figma'],
    setAside: [
      { id: 'k8s', reason: 'individual contributor work' },
      { id: 'inventory', reason: 'unrelated to this posting' },
    ],
  },
};

export const bulletById = (id: string): Bullet =>
  RECORD.find((b) => b.id === id) as Bullet;
