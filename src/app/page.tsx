import Link from 'next/link';
// SSR entry: the main barrel calls React.createContext at module scope, which
// fails during React Server Components evaluation.
import { getSessionUser } from '@/lib/auth/session';
import { Wordmark } from '@/components/brand/wordmark';
import Reveal from '@/components/landing/reveal';
import StageProvider from '@/components/landing/stage-provider';
import Sheet from '@/components/landing/paper-stage';
import { CtaPaste, RoleIndex, StageClause, StageSlider } from '@/components/landing/stage-controls';
import { ROLES, type RoleId } from '@/components/landing/record-data';
import { buttonCls } from '@/components/ui/button';

// Reads the session to pick the nav links, so it must block on the server
// (cacheComponents sanctioned opt-out).
export const instant = false;

const ROLE_CHOICES = (Object.keys(ROLES) as RoleId[]).map((id) => ({
  id,
  label: ROLES[id].label,
}));

const SKILLS = ['React', 'TypeScript', 'GraphQL', 'Kubernetes', 'design systems', 'accessibility (WCAG)', 'Storybook', 'GSAP'];

/**
 * Public landing, set as one document: the reading column tells the story,
 * the paper sheet on the stage re-types itself live beside it. Idea: the
 * single A4 page the product produces IS the fixed half of the page.
 */
export default async function HomePage() {
  const user = await getSessionUser();

  return (
    <main className="bg-background font-serif text-body text-ink">
      {/* Entrance styles only apply once JS is confirmed (see globals.css). */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <Reveal />

      <StageProvider initialRole="frontend">
        <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-5">
          <Wordmark className="text-xl" />
          <nav aria-label="Public" className="flex items-center gap-6">
            {user ? (
              <Link href="/dashboard" className={buttonCls('primary', 'md')}>
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm text-ink underline-offset-4 transition-colors hover:underline">
                  Sign in
                </Link>
                <Link href="/signup" className={buttonCls('primary', 'md')}>
                  Create account
                </Link>
              </>
            )}
          </nav>
        </header>

        <div className="mx-auto grid w-full max-w-[1440px] lg:grid-cols-[minmax(0,44%)_minmax(0,56%)]">
          {/* ---- Reading column ---- */}
          <div className="min-w-0">
            {/* Hero */}
            <section data-stage="tailor" className="px-6 pb-16 pt-10 lg:pt-20">
              <h1 className="reveal max-w-[12ch] text-display font-semibold leading-[0.98] tracking-[-0.03em]">
                Record once. <span className="block">Tailor forever.</span>
              </h1>
              <p className="reveal mt-6 max-w-[46ch] text-lead leading-snug">
                Paste a job description and Sever reorders your CV into one
                clean, ATS-readable page, built only from what you recorded.
              </p>
              <div className="reveal mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link href="/signup" className={buttonCls('primary', 'lg')}>
                  Create account
                </Link>
                <Link href="/login" className="text-ink underline-offset-4 transition-colors hover:underline">
                  Already have one? Sign in
                </Link>
              </div>
              <p className="reveal mt-8 text-sm text-mute">
                Private by default. Your story is never sold, shared, or used to train anything.
              </p>
              {/* Mobile: the sheet sits right under the claim. */}
              <div className="reveal mt-10 flex justify-center bg-surface-2 px-4 py-6 lg:hidden">
                <Sheet />
              </div>
            </section>

            {/* Proof: what one record actually holds */}
            <section data-stage="record" className="border-t-4 border-ink/90 bg-surface px-6 py-16 lg:py-24">
              <h2 className="reveal text-clause font-semibold leading-[1.06] tracking-tight">
                Everything on the page is already yours.
              </h2>
              <p className="reveal mt-4 max-w-[46ch]">
                Sever works from one record of your work. This is a full one:
                nine lines over six years, three employers. The CV can only say
                what these prove, which is why it never has to lie.
              </p>
              <div className="reveal mt-8 grid gap-6 sm:grid-cols-2">
                <figure>
                  <img
                    src="/landing/first-letter-on-a-typewriter-1829.jpg"
                    width={1274}
                    height={982}
                    alt="The first letter written on a typing machine, addressed to Martin Van Buren, Detroit, 1829"
                    loading="lazy"
                    className="h-auto w-full object-cover"
                  />
                  <figcaption className="mt-2 text-sm text-mute">
                    Detroit, 1829: the first letter set down on a machine. One pass, permanent.
                  </figcaption>
                </figure>
                <figure>
                  <video
                    src="/landing/olivetti-dora-portable-typewriter.webm"
                    poster="/landing/olivetti-dora-portable-typewriter-poster.jpg"
                    width={854}
                    height={480}
                    autoPlay
                    muted
                    loop
                    playsInline
                    aria-label="A hand typing on a 1960s Olivetti Dora portable typewriter"
                    className="h-auto w-full object-cover bg-surface-2"
                  />
                  <figcaption className="mt-2 text-sm text-mute">
                    Recording, 1960s: each keystroke lands once and stays.
                  </figcaption>
                </figure>
              </div>
              <div className="reveal mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-3">
                <div>
                  <p className="mb-3 text-mute">Employers</p>
                  <p className="mb-2.5 leading-snug">Meridian Health · 2022–present</p>
                  <p className="mb-2.5 leading-snug">Northline Studio · 2019–2022</p>
                  <p className="mb-2.5 leading-snug">Freelance · 2018–2019</p>
                </div>
                <div>
                  <p className="mb-3 text-mute">Skills</p>
                  {SKILLS.map((s) => (
                    <p key={s} className="mb-2.5 leading-snug">
                      {s}
                    </p>
                  ))}
                </div>
                <div>
                  <p className="mb-3 text-mute">Education</p>
                  <p className="mb-2.5 leading-snug">BSc Computer Science, Technical University Berlin</p>
                </div>
              </div>
            </section>

            {/* How it works, stage by stage */}
            <section className="px-6 py-16 lg:py-24">
              <StageClause />
              <StageSlider />
              <figure className="reveal mt-12 max-w-[42ch] bg-surface p-4">
                <img
                  src="/landing/dr-stowe-ad.png"
                  width={1250}
                  height={820}
                  alt="A situations-wanted notice placed by physician Emily Stowe in the Toronto Globe, 9 September 1885"
                  loading="lazy"
                  className="h-auto w-full"
                />
                <figcaption className="mt-2 text-sm text-mute">
                  &ldquo;Situations wanted&rdquo; has been the game since printed
                  notices. The posting on the left is read the way a person
                  reads this one: line by line.
                </figcaption>
              </figure>
              {/* Mobile: the sheet rides along pinned to the bottom while the
                  stages scroll by, then releases with the section. */}
              <div className="sticky bottom-0 z-10 -mx-6 mt-10 flex h-[44svh] justify-center overflow-hidden bg-surface-2 py-4 lg:hidden">
                <Sheet />
              </div>
            </section>

            {/* Showcase: the same record, cut three ways */}
            <section data-stage="tailor" className="border-t-4 border-ink/90 bg-surface">
              <img
                src="/landing/letter-of-resignation-in-old-typewriter.jpg"
                width={1920}
                height={1280}
                alt="Close view of blank paper rolling into an old typewriter, the first words already struck"
                loading="lazy"
                className="h-[36svh] w-full object-cover"
              />
              <div className="px-6 py-16 lg:py-24">
              <h2 className="reveal text-clause font-semibold leading-[1.06] tracking-tight">
                One record. A different paper for every posting.
              </h2>
              <p className="reveal mt-4 max-w-[46ch]">
                Pick a posting. The sheet re-sets itself from the same nine
                lines you just read, nothing more.
              </p>
              <div className="reveal mt-8">
                <RoleIndex roles={ROLE_CHOICES} />
              </div>
              </div>
            </section>
          </div>

          {/* ---- Desktop stage: the sheet, always in the room ---- */}
          <aside aria-label="Live CV preview" className="hidden lg:block">
            <div className="sticky top-0 flex h-svh justify-center overflow-hidden bg-surface-2 pt-[max(6svh,48px)]">
              <Sheet />
            </div>
          </aside>
        </div>

        {/* ---- The first step, already open ---- */}
        <section className="bg-primary text-on-primary">
          <div className="mx-auto grid w-full max-w-[1440px] items-center gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:py-32">
            <div className="reveal">
              <h2 className="text-display font-semibold leading-[0.96] tracking-[-0.03em]">
                Start with the posting.
              </h2>
              <p className="mt-5 max-w-[40ch] text-lead leading-snug">
                Paste the job description. It rides with you to the new account
                and opens the wizard filled in.
              </p>
            </div>
            <div className="reveal flex justify-center lg:justify-end">
              <CtaPaste />
            </div>
          </div>
        </section>

        {/* ---- A single quiet line ---- */}
        <footer className="mx-auto grid w-full max-w-[1440px] gap-4 px-6 py-10 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <span className="text-mute">Sever: one record, a CV per posting.</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 sm:justify-center">
            {user ? (
              <Link href="/dashboard" className="text-ink underline-offset-4 hover:underline">Dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="text-ink underline-offset-4 hover:underline">Sign in</Link>
                <Link href="/signup" className="text-ink underline-offset-4 hover:underline">Create account</Link>
              </>
            )}
            <Link href="/privacy" className="text-ink underline-offset-4 hover:underline">Privacy</Link>
            <Link href="/terms" className="text-ink underline-offset-4 hover:underline">Terms</Link>
          </nav>
          <span className="text-mute sm:text-right">
            2026 · Your data belongs to you: export or delete it any time.
          </span>
          <p className="max-w-[65ch] text-[13px] leading-5 text-mute sm:col-span-3">
            Pictures: &ldquo;Letter of Resignation in Old Typewriter&rdquo; by
            CIPHR Connect,{' '}
            <a className="text-ink underline underline-offset-2" href="https://creativecommons.org/licenses/by/2.0">CC BY 2.0</a>
            , via{' '}
            <a className="text-ink underline underline-offset-2" href="https://commons.wikimedia.org/wiki/File:Letter_of_Resignation_in_Old_Typewriter.jpg">Wikimedia Commons</a>
            ; &ldquo;First letter on a typewriter 1829&rdquo; by John O. Sheldon, public domain, via{' '}
            <a className="text-ink underline underline-offset-2" href="https://commons.wikimedia.org/wiki/File:First_letter_on_a_typewriter_1829.jpg">Wikimedia Commons</a>
            ; &ldquo;Dr. Stowe ad&rdquo;, The Globe (Toronto), 1885, public domain, via{' '}
            <a className="text-ink underline underline-offset-2" href="https://commons.wikimedia.org/wiki/File:Dr._Stowe_ad.png">Wikimedia Commons</a>
            ; &ldquo;Olivetti Dora portable typewriter&rdquo; by Erik Pålsson,{' '}
            <a className="text-ink underline underline-offset-2" href="https://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>
            , via{' '}
            <a className="text-ink underline underline-offset-2" href="https://commons.wikimedia.org/wiki/File:Olivetti_Dora_portable_typewriter.webm">Wikimedia Commons</a>.
          </p>
        </footer>
      </StageProvider>
    </main>
  );
}
