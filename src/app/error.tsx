'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { Button, buttonCls } from '@/components/ui/button';
import { randomCareerTip } from '@/lib/fun/career-wisdom';

export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The one console.error the app keeps on purpose: until there is an error
    // reporting service, the digest at least outlives the crash in the log.
    console.error(error);
  }, [error]);

  // One tip per error instance — keyed on digest so a retry that produces a
  // different error gets a fresh quip.
  const tip = useMemo(() => randomCareerTip(), [error.digest]);

  return (
    <main className="mx-auto w-full max-w-[72ch] flex-1 px-6 py-24">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">
        This page hit a snag
      </h1>
      <p className="mt-4 text-[15px] leading-7 text-mute">
        Nothing you saved is lost — a request failed partway through. Try
        again; if it keeps failing, the reference below is what the operator
        needs to find it.
      </p>
      {error.digest && (
        <p className="mt-3 text-xs text-faint">Reference: {error.digest}</p>
      )}
      <blockquote className="mt-6 border-l-2 border-line pl-4 text-[13px] text-mute italic">
        &ldquo;{tip.text}&rdquo;
      </blockquote>
      <div className="mt-8 flex flex-wrap gap-2">
        <Button onClick={retry}>Try again</Button>
        <Link href="/" className={buttonCls('secondary')}>
          Back to the front page
        </Link>
      </div>
    </main>
  );
}
