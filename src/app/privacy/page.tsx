import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Sever stores, what it sends to an AI provider, and how to export or delete all of it.",
};

// Drafted from the actual data paths in the code (proxy/session, Supabase
// RLS, src/lib/ai, src/lib/import, api/account). Review against the AI
// provider's retention terms and fill the contact placeholder before launch.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-[72ch] flex-1 px-6 py-16">
      <article className="font-serif text-ink">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-2 text-sm text-mute">Last updated: October 2026</p>

        <p className="mt-8 border-l-4 border-primary bg-surface p-4 text-[15px] leading-7">
          In one line: Sever stores what you record, sends text to an AI
          provider only to do the work you asked for, sells nothing, and gives
          you one-click export and delete of everything.
        </p>

        <h2 className="mt-10 text-xl font-semibold">What we collect</h2>
        <p className="mt-3 text-[15px] leading-7">
          Only what you type in, plus your email address for the account:
          your personal contact details, the profile entries you record
          (jobs, education, skills, and so on), the job descriptions you
          paste, and the CVs and match analyses the product generates from
          them. We do not collect data from other sources and we do not
          read anything on your device beyond a CV file you choose to
          import.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Where it is stored</h2>
        <p className="mt-3 text-[15px] leading-7">
          In a hosted PostgreSQL database (Supabase). Every table is protected
          by per-user row-level security, so your rows are only readable with
          your own session. The CV file you import is parsed locally in your
          browser — the PDF itself is never uploaded to a third party; only
          the extracted text you approve becomes profile entries.
        </p>

        <h2 className="mt-10 text-xl font-semibold">What goes to an AI provider</h2>
        <p className="mt-3 text-[15px] leading-7">
          To extract requirements from a job description, match them against
          your record, and phrase suggestions, Sever sends that text — plus
          the relevant excerpts of your profile — to the large-language-model
          provider the operator has configured (Anthropic or an
          Anthropic-compatible endpoint). The call exists to produce the
          result you requested. We do not use your data to train our models,
          and we do not send your data to anyone else. The provider&apos;s own
          API terms and retention policy apply to the text in transit and in
          their logs; we send the minimum each task needs.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Cookies and tracking</h2>
        <p className="mt-3 text-[15px] leading-7">
          One purpose only: the session cookies that keep you signed in. No
          analytics, no third-party trackers, no advertising pixels, no
          embedded social widgets. This page you are reading is served by the
          same server as the app.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Your controls</h2>
        <p className="mt-3 text-[15px] leading-7">
          Everything you have stored can be exported as a single JSON file
          from Settings, and deleting your account from Settings removes your
          profile, entries, job descriptions, CVs, analyses, and account in
          one cascade. Edits to any AI-suggested wording are reversible; the
          original text of your entries is kept in each item&apos;s history.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Security</h2>
        <p className="mt-3 text-[15px] leading-7">
          Passwords are handled by the auth provider (salted hashes, never
          stored in plain text by us), the app enforces baseline security
          headers, and access is limited to your own rows by row-level
          security. No system is perfect — if you believe you have found a
          problem, write to us below and we will fix it.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Changes &amp; contact</h2>
        <p className="mt-3 text-[15px] leading-7">
          If this policy changes materially, the date above changes and we
          will say so on the app itself. Questions:{" "}
          {/* review: replace with the real contact address before launch */}
          <a className="text-primary underline underline-offset-4" href="mailto:hello@sever.example">
            hello@sever.example
          </a>
          .
        </p>

        <p className="mt-12 text-sm text-mute">
          <Link href="/" className="text-ink underline underline-offset-4">
            Back to Sever
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="text-ink underline underline-offset-4">
            Terms
          </Link>
        </p>
      </article>
    </main>
  );
}
