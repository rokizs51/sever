'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FilePdf, ArrowUpRight, Trash } from '@phosphor-icons/react';
import type { ResumeSummary } from '@/lib/db/resumes';
import Card from '@/components/ui/card';
import Chip from '@/components/ui/chip';
import { Button } from '@/components/ui/button';

const MODE_LABEL: Record<'as_is' | 'enhance', string> = {
  as_is: 'As-is',
  enhance: 'Enhanced',
};

// 8 rows keep the dashboard section scannable; the list only grows as the
// quota allows (50/month cap server-side).
const PER_PAGE = 8;

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/**
 * Every generated CV, newest first, paged — tappable rounded cards with mode
 * and page-count chips, the PDF icon carrying the "downloadable doc" meaning
 * so color never has to. Each row can be deleted after an inline confirm
 * (destructive action separated from the navigable card). Empty state points
 * straight at the one action that fills it.
 */
export default function VersionList({
  resumes,
  onDelete,
}: {
  resumes: ResumeSummary[];
  onDelete: (id: string) => Promise<void>;
}) {
  const [page, setPage] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (resumes.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span
          aria-hidden
          className="flex size-12 items-center justify-center bg-surface-2 text-mute"
        >
          <FilePdf size={24} />
        </span>
        <p className="text-sm font-medium text-ink">No CVs yet</p>
        <p className="max-w-xs text-sm text-mute">
          Paste a job description to build a CV — from what you have
          recorded, nothing invented.
        </p>
      </Card>
    );
  }

  const pages = Math.max(1, Math.ceil(resumes.length / PER_PAGE));
  // Derived clamp: deleting the last row of the last page lands here, no
  // reset effect needed.
  const cur = Math.min(page, pages - 1);
  const visible = resumes.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);

  const confirmDelete = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await onDelete(id);
      setConfirmId(null);
    } catch {
      setError('Could not delete that CV. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ul className="space-y-3">
        {visible.map((r) => (
          <li key={r.id}>
            <div className="flex items-center gap-2">
              <Link
                href={`/resume/${r.id}`}
                className="group flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3  border border-line bg-surface px-5 py-4 transition-[background-color,border-color,transform] duration-150 hover:border-line-2 hover:bg-surface-2/60 active:scale-[0.995]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center bg-surface-2 text-mute"
                  >
                    <FilePdf size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {dateLabel(r.createdAt)}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-1.5">
                      <Chip>{MODE_LABEL[r.mode]}</Chip>
                      <Chip tone="neutral">{r.pageLimit === 2 ? '2 pages' : '1 page'}</Chip>
                    </span>
                  </span>
                </div>
                <ArrowUpRight
                  aria-hidden
                  size={20}
                  className="shrink-0 text-faint transition-colors group-hover:text-ink"
                />
              </Link>
              {confirmId === r.id ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="dangerSolid"
                    disabled={busy}
                    onClick={() => confirmDelete(r.id)}
                  >
                    {busy ? 'Deleting…' : 'Delete'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Delete the CV from ${dateLabel(r.createdAt)}`}
                  onClick={() => {
                    setError('');
                    setConfirmId(r.id);
                  }}
                >
                  <Trash aria-hidden size={16} />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <nav aria-label="CV pages" className="mt-4 flex items-center justify-between gap-3">
          <Button size="sm" variant="secondary" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
            Previous
          </Button>
          <span className="text-xs tabular-nums text-mute">
            Page {cur + 1} of {pages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={cur >= pages - 1}
            onClick={() => setPage(cur + 1)}
          >
            Next
          </Button>
        </nav>
      )}

      {error && (
        <p role="alert" className="mt-3  bg-wash-red px-3 py-2 text-sm text-tone-red">
          {error}
        </p>
      )}
    </div>
  );
}
