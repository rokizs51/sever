# Improvement roadmap

Prioritized by what breaks users or costs money first. Derived from a
code/migration review, not live traffic or Supabase advisor data.

## P0 — fix before opening signup

- [ ] **Lock down the generation quota table.** `generation_quota` has an
      `for all` RLS policy (`supabase/migrations/0001_init.sql`), and the
      browser holds the anon key plus the user JWT. A user can
      `PATCH /rest/v1/generation_quota` to zero their counter. The same table is
      the global cost ledger, so the budget breaker can be corrupted too.
      Make it select-only for `authenticated`; write through a
      `SECURITY DEFINER` `record_usage(p_cost, p_generations)` RPC that enforces
      `user_id = auth.uid()`. Effort: **S–M**.

- [ ] **Make quota and budget checks atomic.** `currentUsage()` followed later
      by `recordGeneration()` lets N concurrent `generate` requests all pass the
      50-cap and the global ceiling. Do the check and increment in one
      statement/RPC (`insert … on conflict do update … where generations < cap
      returning`). Effort: **M**.

- [ ] **Record JD extraction spend.** `src/app/api/jds/extract/route.ts` reads
      `globalLlmCost` but never calls `recordGeneration`, so the budget breaker
      is blind to extraction. It also has no per-user cap and no maximum input
      length. Add a length cap and a cost-only ledger entry. Effort: **S**.

- [ ] **Clear stuck `running` analyses.** `executeAnalysis` fails the row on
      thrown errors, but a serverless timeout kills the process before the
      `catch`. The row stays `running`; `getRunningForJd()` returns it forever
      and `rerun` answers `409 already_running`. Add a staleness sweep (treat a
      `running` row older than ~10 minutes as failed) or a DB-level timeout.
      Effort: **S**.

- [ ] **Finish the auth surface.** No password reset (and no `/auth/callback`
      for Supabase recovery), no change-password/change-email, no verification
      branch (with confirmations on, signup lands on `/login` silently), and no
      rate limiting on auth or AI routes. The spec deferred these to the
      open-signup phase — signup is now open. Effort: **M**.

## P1 — the product gaps users will hit

- [ ] **Give saved JDs and analyses a home.** Today they are write-only:
      `listJds` is only used by the JSON export, and there is no list, delete,
      or reopen UI. After leaving the analysis page, that work is unreachable.
      Add a "Jobs" section on the dashboard with reopen, delete, and "generate
      from this JD". Effort: **M**.

- [ ] **Let users edit a generated CV directly.** The spec promised "direct
      editing of any line"; today only suggestion accept/edit exists, so an
      as-is CV must be fixed in the profile and regenerated. Add inline editing
      on the preview, re-run the fit, and keep the export gate. Effort: **M–L**.

- [ ] **Review the JD extraction before it drives matching.** The "What this
      job wants" chips are read-only, yet they drive analysis and generation.
      A misread requirement currently poisons the whole match. Let users
      edit/remove requirements before analysis. Effort: **M**.

- [ ] **Make the one-page rule honest.** `src/app/api/resumes/[id]/pdf/route.ts`
      exports at any page count and only reports `X-Resume-Pages`, while the
      landing and README promise a one-page CV. Either enforce the limit or
      change the copy to "one page by default". Effort: **S**.

- [ ] **Confirm destructive profile deletes.** `ItemEditor` calls `onDelete`
      with no confirmation, unlike `VersionList` which has an inline confirm.
      Add the same confirm (or an undo toast). Effort: **S**.

## P2 — reliability and ops

- [ ] **Add CI.** GitHub Actions running `lint`, `tsc --noEmit`, `test`, and
      `build`. Decide what to do with the existing lint errors in
      `src/test-helpers/supa-stub.ts` (55 errors today). Add `.gitattributes`
      (`* text=auto eol=lf`) to kill the Windows CRLF failure in
      `src/lib/domain/seed.test.ts`. Effort: **S**.

- [ ] **Add error boundaries and monitoring.** `error.tsx`, `not-found.tsx`,
      and `loading.tsx` under `src/app/`; structured logs or Sentry. Today every
      failure is a `console.error` and a raw Next error page. Effort: **S–M**.

- [ ] **Add an end-to-end test of the core promise.** Unit coverage is strong,
      but nothing drives signup → profile → generate → accept → PDF. Add
      Playwright with `makeFakeGenAI` behind an env flag so the flow runs
      without AI credits. Effort: **M**.

- [ ] **Record actual token usage.** `generateJson` discards the AI SDK's
      `result.usage`; the ledger uses fixed token models. Return usage from the
      call and record real input/output tokens so the budget breaker means what
      it says. Effort: **S–M**.

- [ ] **Set a timeout strategy for long LLM calls.** Generation and analysis
      run inline in route handlers. Set `maxDuration`, and for slow providers
      move work to a job/queue or stream progress; otherwise the stuck-row
      problem repeats for generation too. Effort: **M–L**.

## P3 — polish and trust

- [ ] Add privacy/terms pages: the landing makes explicit data promises and
      there is no policy page.
- [ ] Add `sitemap.ts`, `robots.ts`, and an OG image.
- [ ] Improve empty-dashboard onboarding: make "Record your profile" or
      "Import" the first action, with sample data; keep the generic wizard
      second.
- [ ] Assign `position` on manual item creation (every manual item is `0`
      today, so display order is unspecified); add drag-to-reorder if profile
      order should matter.
- [ ] Add `created_at` to `profile_items` for audit/sort.
- [ ] Add baseline security headers (`X-Content-Type-Options`,
      `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`). Add a CSP
      later, after handling the landing's inline pre-paint script.
- [ ] Run an axe/Chrome accessibility pass on the profile and resume screens.
- [ ] Remove the Next starter SVGs from `public/`.

## Suggested order

1. P0 items 1–4 (close the money/abuse holes and the stuck-analysis trap).
2. P0 auth before any public push.
3. P1 items 1–3 (saved work, direct editing, extraction review).
4. P2 CI early — it makes everything after it cheaper.

## Caveat

The quota/RLS and concurrency findings are verified from the migrations and
code, not from observed traffic or Supabase advisor output. The riskiest
assumption is the quota race: if a single user never fires concurrent
requests, the practical impact is low — the fix is still smaller than the
incident.