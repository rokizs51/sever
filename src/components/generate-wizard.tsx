'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Lightning, MagnifyingGlass, Scissors } from '@phosphor-icons/react';
import { JdChips } from '@/components/jd-chips';
import type { GenMode, JdExtraction } from '@/lib/domain/types';
import Card, { SectionHeading } from '@/components/ui/card';
import { Button, buttonCls } from '@/components/ui/button';

const DRAFT_KEY = 'jd-draft';

type Step = 'paste' | 'configure';

/**
 * Plain-language copy for API error codes. The paste-JD route already returns
 * user-friendly messages (not_a_job_description, too_short); generation
 * returns developer-facing text for some codes, so we translate by code first
 * and fall back to the server message.
 */
function friendlyError(code: string | undefined, message: string | undefined): string {
  switch (code) {
    case 'quota':
      return "You've used all 50 resumes this month. The count resets next month.";
    case 'budget_exhausted':
      return 'AI rewrites are paused while this month\'s AI budget recovers. "As-is" still works.';
    case 'not_found':
      return 'That saved job description is missing. Paste it again and extract once more.';
    case 'invalid_request':
      return 'That request did not go through. Check the mode and page options and try again.';
    default:
      return message || 'Something went wrong. Please try again.';
  }
}

function StepPills({ step }: { step: Step }) {
  const steps: { id: Step; n: string; label: string }[] = [
    { id: 'paste', n: '1', label: 'Paste the job' },
    { id: 'configure', n: '2', label: 'Choose how' },
  ];
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
      {steps.map((s, i) => {
        const current = s.id === step;
        const done = i === 0 && step === 'configure';
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              aria-current={current ? 'step' : undefined}
              className={
                'flex items-center gap-2  px-3 py-1.5 text-xs font-medium transition-colors ' +
                (current
                  ? 'bg-surface-2 text-ink'
                  : done
                    ? 'bg-wash-green text-tone-green'
                    : 'bg-surface-2 text-mute')
              }
            >
              {done ? <Check aria-hidden size={12} weight="bold" /> : <span className="tabular-nums">{s.n}</span>}
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface GenerateWizardProps {
  // Deep links (from the analysis view's "Generate tailored CV"): a JD
  // already extracted server-side, and the match analysis to tailor against.
  initialJdId?: string | null;
  initialAnalysisId?: string | null;
}

export default function GenerateWizard({ initialJdId, initialAnalysisId }: GenerateWizardProps = {}) {
  const router = useRouter();

  const [step, setStep] = useState<Step>('paste');
  const [raw, setRaw] = useState('');
  const [jdId, setJdId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<JdExtraction | null>(null);
  const [mode, setMode] = useState<GenMode>('as_is');
  const [pageLimit, setPageLimit] = useState<1 | 2>(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(initialAnalysisId ?? null);
  const [analyzing, setAnalyzing] = useState(false);

  // Deep-linked JD: load its stored extraction and land on step 2.
  useEffect(() => {
    if (!initialJdId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/jds/${initialJdId}`);
        const data = await res.json();
        if (cancelled || !res.ok) return;
        setJdId(data.jd.id);
        setRaw(data.jd.raw ?? '');
        setExtraction(data.jd.extraction);
        setStep('configure');
      } catch {
        // fall back to the plain paste flow
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialJdId]);

  // Recover the pasted JD after a login redirect (Review Focus 4).
  useEffect(() => {
    (async () => {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) {
        setRaw(draft);
        sessionStorage.removeItem(DRAFT_KEY);
      }
    })();
  }, []);

  const handleUnauthorized = () => {
    // Preserve what the user pasted, send them to log in, and let the
    // draft-recovery effect above restore it when they come back.
    sessionStorage.setItem(DRAFT_KEY, raw);
    router.push('/login');
  };

  const handleExtract = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/jds/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setError(friendlyError(data.error?.code, data.error?.message));
        return; // stay on step 1, no silent retry
      }

      setJdId(data.jdId);
      setExtraction(data.extraction);
      setStep('configure');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async () => {
    if (!jdId) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/resumes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdId, mode, pageLimit, analysisId }),
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await res.json();
      if (res.status === 201 && data.resume?.id) {
        router.push(`/resume/${data.resume.id}?new=1`);
        return;
      }

      setError(friendlyError(data.error?.code, data.error?.message));
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyze = async () => {
    if (!jdId) return;
    setError('');
    setAnalyzing(true);
    try {
      const res = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdId }),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      // Even a 502 carries the failed analysis row — navigate so the user
      // sees why and gets the Rerun action, rather than a bare error line.
      const data = await res.json();
      if (data.analysis?.id) {
        router.push(`/analysis/${data.analysis.id}`);
        return;
      }
      setError(friendlyError(data.error?.code, data.error?.message));
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (step === 'paste') {
    return (
      <div>
        <StepPills step={step} />
        <Card className="space-y-4 p-6">
          <div>
            <label htmlFor="jd-raw" className="mb-1 block text-sm font-medium text-ink">
              Job description
            </label>
            <p className="mb-2 text-sm text-mute">
              Paste the full posting here: requirements, responsibilities, everything.
            </p>
            <textarea
              id="jd-raw"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={12}
              required
              className="w-full resize-y  border border-line-2 bg-surface px-4 py-3 font-sans text-sm text-ink placeholder:text-faint transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Senior engineer wanted. You will…"
            />
          </div>

          {error && (
            <div
              role="alert"
              className=" border border-line bg-wash-red px-4 py-3 text-sm text-tone-red"
            >
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={handleExtract} disabled={busy || !raw.trim()} size="lg">
              <Lightning aria-hidden size={18} weight="bold" />
              {busy ? 'Extracting…' : 'Extract'}
            </Button>
            <span className="text-xs text-mute">Takes a few seconds.</span>
          </div>
        </Card>
      </div>
    );
  }

  const modeCards: { value: GenMode; title: string; desc: string }[] = [
    {
      value: 'as_is',
      title: 'As-is',
      desc: 'Your words, untouched. We only choose what stays and what the order is.',
    },
    {
      value: 'enhance',
      title: 'Enhance',
      desc: 'We also suggest sharper wording for each line. You accept, edit, or reject every suggestion.',
    },
  ];

  return (
    <div>
      <StepPills step={step} />
      <div className="space-y-6">
        {extraction && (
          <Card className="p-6">
            <SectionHeading className="mb-3">What this job wants</SectionHeading>
            <JdChips extraction={extraction} />
          </Card>
        )}

        {analysisId && (
          <div
            className="flex flex-wrap items-center justify-between gap-3  border border-line bg-wash-green px-4 py-3 text-sm text-tone-green"
            role="status"
          >
            <span>Tailoring to your match analysis. The CV will follow its requirements.</span>
            <span className="flex items-center gap-2">
              <a href={`/analysis/${analysisId}`} className={buttonCls('ghost', 'sm', 'border-none bg-transparent')}>
                View
              </a>
              <button
                type="button"
                onClick={() => setAnalysisId(null)}
                className={buttonCls('ghost', 'sm', 'border-none bg-transparent')}
              >
                Don&apos;t use it
              </button>
            </span>
          </div>
        )}

        <Card className="p-6">
          <SectionHeading className="mb-3">How should we build it?</SectionHeading>
          <fieldset className="space-y-3">
            <legend className="sr-only">Generation mode</legend>
            {modeCards.map((m) => {
              const selected = mode === m.value;
              return (
                <label
                  key={m.value}
                  className={
                    'flex cursor-pointer items-start gap-3  border p-4 transition-[background-color,border-color,transform] duration-150 ' +
                    (selected
                      ? 'border-primary bg-surface-2'
                      : 'border-line hover:border-line-2 hover:bg-surface-2/60')
                  }
                >
                  <input
                    type="radio"
                    name="mode"
                    value={m.value}
                    checked={selected}
                    onChange={() => setMode(m.value)}
                    className="mt-0.5 size-4 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">{m.title}</span>
                    <span className="mt-0.5 block text-sm leading-6 text-mute">{m.desc}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="mt-5">
            <label htmlFor="page-limit" className="mb-1.5 block text-sm font-medium text-ink">
              Page limit
            </label>
            <select
              id="page-limit"
              value={String(pageLimit)}
              onChange={(e) => setPageLimit(e.target.value === '2' ? 2 : 1)}
              className=" border border-line-2 bg-surface px-4 py-2 text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="1">1 page (recommended)</option>
              <option value="2">2 pages</option>
            </select>
          </div>
        </Card>

        {error && (
          <div
            role="alert"
            className=" border border-line bg-wash-red px-4 py-3 text-sm text-tone-red"
          >
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={handleGenerate} disabled={busy} size="lg">
            <Scissors aria-hidden size={18} weight="bold" />
            {busy ? 'Generating…' : 'Generate my CV'}
          </Button>
          <Button variant="secondary" onClick={handleAnalyze} disabled={analyzing || busy || !jdId} size="lg">
            <MagnifyingGlass aria-hidden size={18} weight="bold" />
            {analyzing ? 'Analyzing the match…' : 'Analyze the match first'}
          </Button>
          <button
            type="button"
            onClick={() => {
              setError('');
              setStep('paste');
            }}
            className={buttonCls('ghost', 'sm', 'border-none bg-transparent')}
          >
            Edit the pasted text
          </button>
        </div>
      </div>
    </div>
  );
}
