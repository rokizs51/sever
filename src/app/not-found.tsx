import Link from 'next/link';
import { buttonCls } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-[72ch] flex-1 px-6 py-24">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">
        404 — nothing filed here
      </h1>
      <p className="mt-4 text-[15px] leading-7 text-mute">
        This page is not in the cabinet. Nothing you saved has moved; pick up
        where you left off below.
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
