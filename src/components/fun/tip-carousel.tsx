'use client';

import { useEffect, useState } from 'react';
import { CAREER_WISDOM, type CareerTip } from '@/lib/fun/career-wisdom';

/**
 * A quiet rotating career tip for the dashboard. Cycles every 8 seconds
 * with no animation — just a content swap. Respects prefers-reduced-motion
 * by not auto-advancing (the user can still read at their own pace).
 */
export default function TipCarousel() {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * CAREER_WISDOM.length)
  );
  const tip: CareerTip = CAREER_WISDOM[index];

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return; // no auto-rotate when motion is reduced

    const id = setInterval(() => {
      setIndex((i) => (i + 1) % CAREER_WISDOM.length);
    }, 8_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      aria-label="Career tip"
      role="status"
      aria-live="polite"
      className="rounded border border-line bg-surface px-4 py-3"
    >
      <p className="text-[13px] leading-5 text-mute italic">
        &ldquo;{tip.text}&rdquo;
      </p>
      <p className="mt-1 text-[11px] text-faint">
        — {tip.author}
        {tip.fun ? ' ✂' : ''}
      </p>
    </div>
  );
}
