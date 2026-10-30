import Link from 'next/link';
import { buttonCls } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-[72ch] flex-1 px-6 py-24">
      <pre
        aria-hidden
        className="select-none font-mono text-xs leading-snug text-primary sm:text-sm"
      >{`
    ✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
         this page has been severed
    ✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
      `}</pre>
      <h1 className="mt-6 font-serif text-3xl font-semibold tracking-tight text-ink">
        404 — nothing filed here
      </h1>
      <p className="mt-4 text-[15px] leading-7 text-mute">
        This page got snipped from the cabinet. Nothing you saved has moved;
        pick up where you left off below.
      </p>
      <p className="mt-2 text-[13px] text-faint">
        If you followed a link here, the scissors may have been too eager.
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        <Link href="/" className={buttonCls('primary')}>
          Back to the front page
        </Link>
        <Link href="/dashboard" className={buttonCls('secondary')}>
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
