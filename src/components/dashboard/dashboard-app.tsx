'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from '@phosphor-icons/react';
import VersionList from '@/components/dashboard/version-list';
import type { ItemType, ProfileItem } from '@/lib/domain/types';
import type { PersonalInfo } from '@/lib/db/profiles';
import { TYPE_FIELDS, TYPE_LABELS } from '@/components/profile/fields';
import type { ResumeSummary } from '@/lib/db/resumes';
import Card, { SectionHeading } from '@/components/ui/card';
import Chip from '@/components/ui/chip';
import Progress from '@/components/ui/progress';
import { SkeletonCard } from '@/components/ui/skeleton';
import { buttonCls } from '@/components/ui/button';
import { SAMPLE_ENTRIES } from '@/lib/domain/sample-profile';

// Every section counts toward completeness — derived, not re-listed, so a
// new ItemType can't silently skip the panel (TYPE_FIELDS is Record<ItemType>).
const CHECKED_TYPES = Object.keys(TYPE_FIELDS) as ItemType[];

// A section's bar reads as "full" at a sane entry count (3 entries is plenty;
// beyond that the extra detail belongs in the profile, not the gauge).
const SECTION_TARGET = 3;

interface Quota {
  used: number;
  cap: number;
}

export default function DashboardApp() {
  const router = useRouter();
  const [items, setItems] = useState<ProfileItem[] | null>(null);
  const [resumes, setResumes] = useState<ResumeSummary[] | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [personal, setPersonal] = useState<PersonalInfo | null>(null);
  const [omnibox, setOmnibox] = useState('');
  const [loadError, setLoadError] = useState('');
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleMsg, setSampleMsg] = useState('');
  const [sampleError, setSampleError] = useState('');

  const load = async () => {
    const [iRes, rRes, pRes] = await Promise.all([
      fetch('/api/profile/items'),
      fetch('/api/resumes'),
      fetch('/api/profile'),
    ]);

    // Only an absent/expired session gets bounced; a 500 is ours to show,
    // not a reason to claim the user was signed out.
    if (iRes.status === 401 || rRes.status === 401 || pRes.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!iRes.ok || !rRes.ok || !pRes.ok) throw new Error('load failed');

    const [iData, rData, pData] = await Promise.all([
      iRes.json(),
      rRes.json(),
      pRes.json(),
    ]);
    setItems(iData.items);
    setResumes(rData.resumes);
    setQuota(rData.quota);
    setPersonal(pData.profile.personal);
  };

  useEffect(() => {
    load().catch(() =>
      setLoadError('Could not load your dashboard. Check your connection and refresh.')
    );
    // mount-only: later list changes arrive through the action handlers below
  }, []);

  // The landing page hands a pasted posting over on this channel; adopt it
  // before the wizard can claim it.
  useEffect(() => {
    const draft = sessionStorage.getItem('jd-draft');
    if (draft) {
      setOmnibox(draft);
      sessionStorage.removeItem('jd-draft');
    }
  }, []);

  const counts = useMemo(() => {
    if (!items || !resumes || !personal) return null;
    const filled = CHECKED_TYPES.filter((t) => items.some((i) => i.type === t));
    // Personal details are a profile section too: a CV with no name or email
    // has a blank header, so "everything filled" must include them.
    const detailsFilled =
      personal.fullName.trim() !== '' && personal.email.trim() !== '';
    const totalSections = CHECKED_TYPES.length + 1;
    const filledCount = filled.length + (detailsFilled ? 1 : 0);
    return {
      totalCvs: resumes.length,
      completeness: Math.round((filledCount / totalSections) * 100),
      filledCount,
      totalSections,
      detailsFilled,
      byType: CHECKED_TYPES.map((t) => ({
        type: t,
        count: items.filter((i) => i.type === t).length,
      })),
    };
  }, [items, resumes, personal]);

  if (loadError) {
    return (
      <main className="px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <Card className="p-6">
            <p role="alert" className="text-sm text-tone-red">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={buttonCls('secondary', 'sm', 'mt-4')}
            >
              Try again
            </button>
          </Card>
        </div>
      </main>
    );
  }

  if (!counts || !items || !resumes || !quota) {
    return (
      <main className="px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </main>
    );
  }

  const missing = [
    ...(counts.detailsFilled ? [] : ['your details']),
    ...counts.byType
      .filter((b) => b.count === 0)
      .map((b) => TYPE_LABELS[b.type].toLowerCase()),
  ];

  const removeResume = async (id: string) => {
    const res = await fetch(`/api/resumes/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    setResumes((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
  };

  const startFromOmnibox = () => {
    if (!omnibox.trim()) return;
    // Same draft channel the wizard already restores after login redirects.
    sessionStorage.setItem('jd-draft', omnibox);
    router.push('/generate');
  };

  // A profile with neither entries nor name/email has nothing to tailor from;
  // the hero then puts recording first and demotes the posting box to a card.
  const recordFirst = items.length === 0 && !counts.detailsFilled;

  const loadSample = async () => {
    setSampleBusy(true);
    setSampleError('');
    try {
      for (const entry of SAMPLE_ENTRIES) {
        // career_snapshot is single-only by API design; the rest batch.
        const body =
          entry.type === 'career_snapshot'
            ? { type: entry.type, payload: entry.payloads[0] }
            : { type: entry.type, payloads: entry.payloads };
        const res = await fetch('/api/profile/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('sample load failed');
      }
      await load();
      setSampleMsg('Sample record loaded — every line is editable or deletable.');
    } catch {
      setSampleError('Could not load the sample record. Try recording your profile instead.');
    } finally {
      setSampleBusy(false);
    }
  };

  // Omnibox, wired to the wizard through the draft channel; used in both hero
  // variants.
  const omniboxBlock = (
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
      <textarea
        aria-label="Paste a job description to start a new CV"
        value={omnibox}
        onChange={(e) => setOmnibox(e.target.value)}
        rows={2}
        placeholder="Paste a job description here…"
        className="min-h-12 flex-1 resize-none border border-transparent bg-surface px-4 py-3 text-sm text-ink placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <button
        type="button"
        onClick={startFromOmnibox}
        disabled={!omnibox.trim()}
        className={buttonCls('primary', 'lg', 'shrink-0')}
      >
        <Plus aria-hidden size={18} weight="bold" />
        Build a CV
      </button>
    </div>
  );

  return (
    <main className="px-4 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-10">
        {/* Outside the hero: the success state replaces the sample hero, so a
            message inside it would never render, let alone be announced. */}
        {sampleMsg && (
          <p role="status" className="text-sm text-ink">
            {sampleMsg}
          </p>
        )}
        {sampleError && (
          <p role="alert" className="text-sm text-tone-red">
            {sampleError}
          </p>
        )}
        {/* Hero: one full ink field, the page's single deliberate inversion */}
        {recordFirst ? (
          <>
            <section
              aria-label="Start with your record"
              className="bg-ink px-6 py-8 text-background sm:px-8"
            >
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                First the record. Then the CV.
              </h1>
              <p className="mt-1 max-w-[52ch] text-sm text-background/75">
                Sever tailors only what you have actually recorded — nothing
                is invented. Add your own experience, or load a sample record
                to see how the product works.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/profile?import=1" className={buttonCls('primary', 'lg')}>
                  Import an existing CV
                </Link>
                <Link href="/profile" className={buttonCls('secondary', 'lg')}>
                  Record your profile
                </Link>
                <button
                  type="button"
                  onClick={loadSample}
                  disabled={sampleBusy}
                  className={buttonCls('soft', 'lg')}
                >
                  {sampleBusy ? 'Loading…' : 'Load the sample record'}
                </button>
              </div>
            </section>

            {/* The generic wizard path, second for a user with nothing on file. */}
            <section aria-label="Start from a posting">
              <Card className="p-6">
                <SectionHeading>Or start from a posting</SectionHeading>
                <p className="mt-1 text-sm text-mute">
                  A CV for every job — once there is something to tailor from.
                </p>
                {omniboxBlock}
                <p className="mt-2 text-xs text-mute">
                  We only use what&apos;s in your profile. Nothing is invented.
                </p>
              </Card>
            </section>
          </>
        ) : (
          <section
            aria-label="Start a new CV"
            className="bg-ink px-6 py-8 text-background sm:px-8"
          >
            <div className="relative">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Let&apos;s tailor your CV
              </h1>
              <p className="mt-1 text-sm text-background/75">
                One profile, a CV for every job. Paste a posting and go.
              </p>
              {omniboxBlock}
              <p className="mt-2 text-xs text-background/75">
                We only use what&apos;s in your profile. Nothing is invented.
              </p>
            </div>
          </section>
        )}

        {/* Key numbers */}
        <section aria-label="At a glance">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card className="px-5 py-4">
              <p className="text-2xl font-bold tabular-nums text-ink">{counts.totalCvs}</p>
              <p className="mt-0.5 text-xs text-mute">CVs saved</p>
            </Card>
            <Card className="px-5 py-4">
              <p className="text-2xl font-bold tabular-nums text-ink">{quota.used}</p>
              <p className="mt-0.5 text-xs text-mute">
                this month · {Math.max(0, quota.cap - quota.used)} of {quota.cap} left
              </p>
            </Card>
            <Card className="col-span-2 px-5 py-4 sm:col-span-1">
              <p className="text-2xl font-bold tabular-nums text-ink">{counts.completeness}%</p>
              <p className="mt-0.5 text-xs text-mute">
                profile filled · {counts.filledCount}/{counts.totalSections} sections
              </p>
            </Card>
          </div>
        </section>

        {/* Profile build-out: per-category progress bars */}
        <section aria-labelledby="profile-fill">
          <div className="mb-3 flex items-center justify-between gap-4">
            <SectionHeading id="profile-fill">Profile build-out</SectionHeading>
            <Link
              href="/profile"
              className="text-sm font-medium text-primary transition-colors hover:text-primary-press"
            >
              Edit profile →
            </Link>
          </div>
          <Card className="space-y-4 p-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <Chip>Your details</Chip>
                <span className="text-xs tabular-nums text-mute">
                  {counts.detailsFilled ? 'complete' : 'empty'}
                </span>
              </div>
              <Progress
                value={counts.detailsFilled ? 1 : 0}
                max={1}
                label={`Your details: ${counts.detailsFilled ? 'complete' : 'empty'}`}
              />
            </div>
            {counts.byType.map(({ type, count }) => (
              <div key={type}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <Chip>{TYPE_LABELS[type]}</Chip>
                  <span className="text-xs tabular-nums text-mute">
                    {count === 0 ? 'empty' : `${count} ${count === 1 ? 'entry' : 'entries'}`}
                  </span>
                </div>
                <Progress
                  value={Math.min(count, SECTION_TARGET)}
                  max={SECTION_TARGET}
                  label={`${TYPE_LABELS[type]}: ${count} entries`}
                />
              </div>
            ))}
          </Card>
          {missing.length > 0 && (
            <p className="mt-3 text-xs leading-5 text-mute">
              A CV draws from everything you record —{' '}
              <Link href="/profile" className="font-medium text-primary hover:underline">
                fill in {missing.join(', ')}
              </Link>{' '}
              for stronger matches.
            </p>
          )}
        </section>

        {/* Generated CVs */}
        <section aria-labelledby="cv-list">
          <div className="mb-3">
            <SectionHeading id="cv-list">Generated CVs</SectionHeading>
          </div>
          <VersionList resumes={resumes} onDelete={removeResume} />
        </section>
      </div>
    </main>
  );
}