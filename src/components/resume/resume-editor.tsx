'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Check, DownloadSimple, Lock } from '@phosphor-icons/react';
import type { GeneratedResume } from '@/lib/db/resumes';
import type { JdExtraction, SuggestionState } from '@/lib/domain/types';
import SuggestionReview, { type SuggestionRow } from './suggestion-review';
import MatchPanel, { type CutRow } from './match-panel';
import Card, { SectionHeading } from '@/components/ui/card';
import Chip from '@/components/ui/chip';
import { Button, buttonCls } from '@/components/ui/button';

// react-pdf's PDFViewer throws when its module is evaluated on Node, and
// React.lazy is still prerendered (SSR'd) by default — next/dynamic with
// ssr:false (inside this client component, per the Next docs) keeps the
// import browser-only.
const Preview = dynamic(() => import('./preview'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center  border border-line bg-surface text-sm text-mute">
      Rendering the page…
    </div>
  ),
});

/**
 * The preview screen (spec screen #4): the rendered CV as the single source
 * component, the suggestion dispositions gating export, the honest
 * "won't fit" banner with its 2-page escape hatch, and the live match/cut
 * panel. All mutation goes through the PATCH/fit routes — the client never
 * edits the stored doc directly.
 */
export default function ResumeEditor({
  resume: initialResume,
  extraction: initialExtraction,
}: {
  resume: GeneratedResume;
  extraction: JdExtraction | null;
}) {
  const [resume, setResume] = useState(initialResume);
  const [extraction, setExtraction] = useState(initialExtraction);
  // Cut list is advisory: populated by the first refit call below.
  const [cuts, setCuts] = useState<CutRow[]>([]);
  const [overflow, setOverflow] = useState(resume.fit.overflow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // suggestionId → local decision, not yet sent to the server.
  const [decisions, setDecisions] = useState<
    Record<string, { status: 'accepted' | 'rejected' | 'edited'; finalText?: string }>
  >({});

  const docTextFor = useCallback(
    (itemId: string): string => {
      for (const section of resume.doc.sections) {
        for (const item of section.items) {
          if (item.sourceItemId === itemId) return item.text;
        }
      }
      return '';
    },
    [resume]
  );

  const refit = useCallback(
    async (current: GeneratedResume) => {
      try {
        const userEdits: Record<string, string> = {};
        for (const s of current.statuses) {
          if ((s.status === 'accepted' || s.status === 'edited') && s.suggestion.kind === 'bullet' && s.finalText) {
            userEdits[s.suggestion.targetItemId] = s.finalText;
          }
        }
        const res = await fetch(`/api/resumes/${current.id}/fit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userEdits }),
        });
        if (res.ok) {
          const data = await res.json();
          setCuts(data.cuts ?? []);
          setOverflow(!!data.overflow);
        }
      } catch {
        // Live cut list is advisory; a failed recompute keeps the last known state.
      }
    },
    []
  );

  useEffect(() => {
    refit(resume).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resync = useCallback(async () => {
    const res = await fetch(`/api/resumes/${resume.id}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.resume) {
        setResume(data.resume);
        setExtraction(data.extraction ?? null);
        await refit(data.resume);
      }
    }
  }, [resume.id, refit]);

  const applyResponse = async (res: Response): Promise<void> => {
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error?.message || 'That change did not go through. Please try again.');
      // 409 already_dispositioned (lost race / stale tab) means the SERVER has
      // newer truth than this client — pull it so the "N waiting" badge and the
      // Download gate stop showing a pending state that no longer exists.
      if (res.status === 409) await resync();
      return;
    }
    setError('');
    if (data?.resume) {
      setResume(data.resume);
      if (data.extraction !== undefined) setExtraction(data.extraction);
      await refit(data.resume);
    }
  };

  // Decisions are local (instant click, Undo before apply); the whole batch
  // reaches the server in one PATCH so N reviews cost one save, not N writes.
  const disposition = (
    suggestionId: string,
    status: 'accepted' | 'rejected' | 'edited',
    finalText?: string
  ) => {
    setError('');
    setDecisions((d) => ({ ...d, [suggestionId]: { status, ...(finalText ? { finalText } : {}) } }));
  };

  const undoDecision = (suggestionId: string) => {
    setDecisions((d) => {
      const rest = { ...d };
      delete rest[suggestionId];
      return rest;
    });
  };

  const applyDecisions = async () => {
    const list = Object.entries(decisions).map(([suggestionId, d]) => ({ suggestionId, ...d }));
    if (list.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/resumes/${resume.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispositions: list }),
      });
      await applyResponse(res);
      if (res.status === 409) setDecisions({}); // server resynced — drafts are stale
      else if (res.ok)
        setDecisions((prev) => {
          const out = { ...prev };
          for (const { suggestionId } of list) delete out[suggestionId];
          return out;
        });
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const changePageLimit = async (pageLimit: 1 | 2) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/resumes/${resume.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageLimit }),
      });
      await applyResponse(res);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const undecided = resume.statuses.filter(
    (s) => s.status === 'pending' && !decisions[s.suggestion.id]
  ).length;
  const draftCount = Object.keys(decisions).length;

  // Honest pagination signal: the server reports the ACTUAL rendered page
  // count (X-Resume-Pages) once the CV is exportable. Advisory — never
  // blocks, never shrinks type or drops content to make the number fit.
  const [pageInfo, setPageInfo] = useState<{ pages: number; limit: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (undecided > 0 || draftCount > 0) {
        setPageInfo(null);
        return;
      }
      try {
        const res = await fetch(`/api/resumes/${resume.id}/pdf`);
        const pages = res.headers.get('X-Resume-Pages');
        const limit = res.headers.get('X-Resume-Page-Limit');
        if (!cancelled && res.ok && pages && limit) {
          setPageInfo({ pages: Number(pages), limit: Number(limit) });
        }
      } catch {
        // advisory only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resume.id, undecided, draftCount, resume.doc]);

  const rows: SuggestionRow[] = resume.statuses.map((state) => {
    const d = decisions[state.suggestion.id];
    const merged: SuggestionState = d
      ? {
          ...state,
          status: d.status,
          finalText: d.status === 'rejected' ? null : d.finalText ?? state.suggestion.newText,
        }
      : state;
    return {
      state: merged,
      originalText:
        merged.suggestion.kind === 'summary'
          ? resume.doc.summary ?? ''
          : docTextFor(merged.suggestion.targetItemId),
      draft: !!d,
    };
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="sticky top-6">
          <Preview doc={resume.doc} pageLimit={resume.pageLimit} />
        </div>

        {overflow && (
          <div
            role="alert"
            className="mt-4  bg-wash-amber p-4 text-sm text-tone-amber"
          >
            <p className="font-medium">
              Pinned content alone is more than {resume.pageLimit === 2 ? 'two pages' : 'one page'}.
            </p>
            <p className="mt-1">
              Nothing was dropped to make it fit. Un-pin something on your profile
              {resume.pageLimit === 1 ? ', or switch to two pages.' : '.'}
            </p>
            <div className="mt-3 flex gap-2">
              {resume.pageLimit === 1 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => changePageLimit(2)}
                  className={buttonCls('secondary', 'sm')}
                >
                  Use two pages
                </button>
              )}
              {resume.pageLimit === 2 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => changePageLimit(1)}
                  className={buttonCls('secondary', 'sm')}
                >
                  Back to one page
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <aside aria-label="Review and export" className="space-y-6">
        {/* Sticky so Apply/Download never hide below the fold of a long review. */}
        <Card className="sticky top-4 z-10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading>Suggestions</SectionHeading>
            {undecided > 0 && <Chip tone="amber">{undecided} waiting</Chip>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {draftCount > 0 && (
              <Button size="sm" disabled={busy} onClick={applyDecisions}>
                <Check aria-hidden size={14} weight="bold" />
                {busy ? 'Applying…' : `Apply ${draftCount} decision${draftCount > 1 ? 's' : ''}`}
              </Button>
            )}
            {undecided === 0 && draftCount === 0 ? (
              <a href={`/api/resumes/${resume.id}/pdf`} className={buttonCls('primary', 'sm')}>
                <DownloadSimple aria-hidden size={16} weight="bold" />
                Download PDF
              </a>
            ) : null}
            {undecided === 0 && draftCount === 0 && pageInfo && pageInfo.pages > pageInfo.limit ? (
              <Chip tone="amber">spans {pageInfo.pages} pages (limit {pageInfo.limit})</Chip>
            ) : null}
            {undecided + draftCount > 0 ? (
              <button
                type="button"
                disabled
                title="Decide every suggestion before exporting"
                className="inline-flex cursor-not-allowed items-center gap-2 bg-surface-2 px-4 py-1.5 text-sm font-medium text-faint"
              >
                <Lock aria-hidden size={14} />
                Download PDF
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-mute">
            {draftCount > 0
              ? 'Decisions stay on this page until you apply them. The whole batch saves in one step.'
              : undecided > 0
                ? `Decide every suggestion (${undecided} left) before exporting — the PDF only ever contains wording you approved.`
                : 'Everything is applied. The PDF holds exactly the wording you approved.'}
          </p>
        </Card>

        <SuggestionReview rows={rows} onDisposition={disposition} onUndo={undoDecision} />

        {error && (
          <div role="alert" className=" bg-wash-red px-4 py-3 text-sm text-tone-red">
            {error}
          </div>
        )}

        <section>
          <MatchPanel extraction={extraction} doc={resume.doc} cuts={cuts} />
        </section>
      </aside>
    </div>
  );
}
