import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description: "The rules for using Sever: what it promises, what it does not.",
};

// Plain-language draft for a small product. Review before launch; add the
// operator's legal identity if invoicing or a business entity exists.
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-[72ch] flex-1 px-6 py-16">
      <article className="font-serif text-ink">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of use</h1>
        <p className="mt-2 text-sm text-mute">Last updated: October 2026</p>

        <h2 className="mt-8 text-xl font-semibold">What Sever is</h2>
        <p className="mt-3 text-[15px] leading-7">
          Sever turns the career record <em>you</em> enter into a tailored,
          one-page CV for a job description you paste. The product promise is
          that it reorganizes and rephrases what you have actually recorded —
          it does not invent experience, and every suggested wording change
          shows up for your approval and can be reverted.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Your account</h2>
        <p className="mt-3 text-[15px] leading-7">
          One account per person; keep your password to yourself. You are
          responsible for anything done under your account. You may delete it
          at any time from Settings, which erases your data (see{" "}
          <Link href="/privacy" className="text-primary underline underline-offset-4">
            Privacy
          </Link>
          ).
        </p>

        <h2 className="mt-10 text-xl font-semibold">Your content and your rights</h2>
        <p className="mt-3 text-[15px] leading-7">
          You keep all rights to what you record. By using Sever you confirm
          you have the right to submit that content and that it is truthful to
          the best of your knowledge. We process it only to run the product:
          no selling, no publishing, no training on it.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Fair use</h2>
        <p className="mt-3 text-[15px] leading-7">
          CV generation and analysis consume paid AI capacity, so generation
          runs under a per-account quota and an overall budget limit, both of
          which may change. Do not attempt to circumvent them, probe the
          service for vulnerabilities, use Sever&apos;s AI features on
          material you have no rights to, or submit anything unlawful.
        </p>

        <h2 className="mt-10 text-xl font-semibold">No guarantees</h2>
        <p className="mt-3 text-[15px] leading-7">
          Sever helps you write a clearer CV; it cannot and does not guarantee
          interviews, offers, or ATS system outcomes. The CV is ultimately
          yours to review: check names, dates, and claims before you send it,
          because you — not Sever — stand behind what you submit. The service
          is provided &ldquo;as is&rdquo;, without warranty of any kind, to
          the extent permitted by law, and our liability is limited to the
          amount you have paid us (which today is nothing: the service is
          free).
        </p>

        <h2 className="mt-10 text-xl font-semibold">Changes and ending</h2>
        <p className="mt-3 text-[15px] leading-7">
          We may update these terms or the features they describe; material
          changes get a notice in the app. If you break the fair-use rules we
          may limit or end the account; you can always end it yourself and
          take your data with you.
        </p>

        <p className="mt-12 text-sm text-mute">
          <Link href="/" className="text-ink underline underline-offset-4">
            Back to Sever
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="text-ink underline underline-offset-4">
            Privacy
          </Link>
        </p>
      </article>
    </main>
  );
}
