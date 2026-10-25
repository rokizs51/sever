import type { ItemType } from './types';

/**
 * The landing page's persona (src/components/landing/record-data.ts) in
 * profile-item shape: the empty dashboard's "load a sample" button writes the
 * same person the marketing sheet shows. Plain entries afterwards — editable,
 * deletable, same endpoints as manual creation. Payloads only; canonical text
 * is derived server-side on POST.
 */
export const SAMPLE_ENTRIES: { type: ItemType; payloads: Record<string, unknown>[] }[] = [
  {
    type: 'career_snapshot',
    payloads: [
      {
        text: 'Frontend engineer with eight years turning design systems and patient-facing products into shipped React/TypeScript interfaces; lately leading a rebuild across four product teams.',
      },
    ],
  },
  {
    type: 'experience',
    payloads: [
      {
        company: 'Meridian Health',
        role: 'Senior Frontend Engineer',
        start: '2022-06',
        end: '',
        location: 'Berlin, Germany',
        employmentType: 'Full-time',
        technologies: ['React', 'TypeScript', 'Storybook'],
        bullets: [
          'Led the design-system rebuild across 4 product teams (React, TypeScript)',
          'Shipped WCAG 2.2 AA on the patient portal',
          'Kept the Figma library in lockstep with code via Storybook',
          'Mentored 3 junior developers through onboarding',
        ],
      },
      {
        company: 'Northline Studio',
        role: 'Full-Stack Developer',
        start: '2019-08',
        end: '2022-05',
        technologies: ['GraphQL', 'Kubernetes', 'GSAP'],
        bullets: [
          'Migrated the checkout API to GraphQL, −38% latency',
          'Containerised 9 services on Kubernetes; cut build minutes 40%',
          'Built the marketing site’s motion layer (GSAP, reduced-motion first)',
          'Ran quarterly hardware inventory audits',
        ],
      },
      {
        company: 'Freelance',
        role: 'Web Developer',
        start: '2018-07',
        end: '2019-07',
        bullets: ['Rebuilt checkout retries, +2.1% completed payments'],
      },
    ],
  },
  {
    type: 'skill',
    payloads: [
      { name: 'React', level: 'Expert', category: 'Frontend' },
      { name: 'TypeScript', level: 'Expert', category: 'Languages' },
      { name: 'Design systems', level: 'Expert', category: 'Frontend' },
      { name: 'Accessibility (WCAG)', level: 'Advanced', category: 'Practice' },
      { name: 'GraphQL', level: 'Advanced', category: 'Backend' },
      { name: 'Kubernetes', level: 'Intermediate', category: 'Platform' },
    ],
  },
  {
    type: 'education',
    payloads: [
      {
        school: 'Technical University Berlin',
        degree: 'BSc',
        field: 'Computer Science',
        startYear: 2015,
        endYear: 2018,
      },
    ],
  },
];
