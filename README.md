# Sever — one profile, a CV for every job

Sever keeps your career facts in one profile (experience, projects, skills,
education) and generates an ATS-friendly, honest CV tailored to a specific job
description. Paste a posting, optionally run a job-match analysis first, then
generate — every rewrite is auditable and you accept or revert it.

Already have a CV? Import it as pasted text or a PDF: Sever extracts the
entries into a review screen, and nothing reaches your profile until you
approve it.

Honesty is enforced as code, not as prompt advice:

- a rewrite that adds a number your profile doesn't contain is downgraded to
  your own wording, with an explicit ask for the evidence;
- rewrites leaning on banned puffery ("leverage", "robust", "seamless", …) are
  likewise reverted;
- JD requirement matches must cite verbatim evidence from your profile —
  unsupported claims are dropped or demoted to `needs_review`, never asserted.

## Stack

Next.js (App Router) · Supabase (auth + Postgres with RLS, anon key only — no
service-role key anywhere) · Anthropic-SDK-compatible AI endpoint (any plan
that speaks it, e.g. Qwen) · `unpdf` for reading uploaded PDFs ·
`@react-pdf/renderer` for the PDF.

> Note: this runs on a Next.js version with breaking changes vs. common
> training data. `AGENTS.md` (auto-managed by `next dev`) tells coding agents
> to read the bundled docs in `node_modules/next/dist/docs/` first.

## Setup

1. Install dependencies: `npm install`
2. Create a Supabase project, then apply the migrations in `supabase/migrations/`
   (in order — `0001_init.sql` … `0005_item_certifications.sql`) via the
   dashboard SQL editor or `supabase db push`.
   Optional: run `supabase/seed.sql` the same way to create a test account —
   `seed.midlevel@example.com` / `SeedPass123!`, a full mid-level software
   engineer profile, and a job description with its extraction pre-filled.
3. Copy `.env.example` to `.env.local` and fill in the Supabase URL and anon
   key (dashboard → Project Settings → API Keys) plus your AI endpoint base
   URL, key, and model ids. The comments in `.env.example` cover the gotchas
   (e.g. the base URL must end at `/v1`).
4. `npm run dev` → http://localhost:3000

## Commands

| Command             | What it does                  |
| ------------------- | ----------------------------- |
| `npm run dev`       | Development server            |
| `npm run build`     | Production build              |
| `npm test`          | Vitest, full suite            |
| `npm run test:watch`| Vitest, watch mode            |
| `npm run lint`      | ESLint                        |

## Where things live

- `src/app/api/` — route handlers: auth, profile items, JDs (extraction),
  analyses (job-match), resumes (generate, fit, PDF).
- `src/lib/ai/` — the GenAI provider interface: prompts, structured-output
  parsing with retry, and the sanitizing trust-boundary passes above.
- `src/lib/resume/` — generation orchestration and the PDF renderer
  (`render/document.tsx`). The section order/labels follow
  `docs/cv-structure-reference.md` — that doc is the spec; when you change the
  template, change the doc in the same commit.
- `src/lib/match/` — job-match analysis validation (evidence rules, statuses).

## Docs

- `docs/cv-structure-reference.md` — the ATS CV structure Sever targets (spec).
- `docs/superpowers/` — the original v1 design spec and plan.
- `docs/verify/` — per-task verification reports (RLS, auth, GenAI provider).
