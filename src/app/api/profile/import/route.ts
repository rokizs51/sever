import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteClient } from '@/lib/db/client';
import { getSessionUser } from '@/lib/auth/session';
import { createGenAI } from '@/lib/ai/client';
import { aiConfig, estimateCostMicros } from '@/lib/ai/env';
import { CvNotParseableError } from '@/lib/ai/types';
import { finalizeCvDraft, normalizeCvText } from '@/lib/domain/cv-import';
import { extractPdfText } from '@/lib/import/pdf';
import { globalLlmCost, monthKey, recordGeneration } from '@/lib/db/quota';

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MIN_TEXT_CHARS = 100;
const MAX_TEXT_CHARS = 40_000;

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * POST /api/profile/import — read a pasted CV or an uploaded PDF into a
 * reviewable draft. Nothing is written to the profile here; the client posts
 * the user-approved entries to /commit.
 */
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail('unauthorized', 'Authentication required', 401);

    const contentType = request.headers.get('content-type') ?? '';
    let text = '';

    if (contentType.includes('multipart/form-data')) {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return fail('invalid_request', 'Could not read the upload', 400);
      }
      const file = form.get('file');
      // Duck-typed rather than `instanceof File`: the global File differs
      // between the Node runtime and the test environment.
      if (
        !file ||
        typeof file === 'string' ||
        typeof file.size !== 'number' ||
        typeof file.arrayBuffer !== 'function'
      ) {
        return fail('invalid_request', 'No PDF file was included', 400);
      }
      if (file.size === 0 || file.size > MAX_PDF_BYTES) {
        return fail('file_too_large', 'The PDF must be 4 MB or smaller', 400);
      }
      const bytes = await file.arrayBuffer();
      const magic = new TextDecoder().decode(new Uint8Array(bytes.slice(0, 5)));
      if (magic !== '%PDF-') {
        return fail('not_a_pdf', 'That file is not a PDF', 400);
      }
      try {
        text = await extractPdfText(bytes);
      } catch {
        return fail('pdf_unreadable', 'Could not read this PDF. Try pasting its text instead.', 400);
      }
      if (text.trim().length < MIN_TEXT_CHARS) {
        return fail(
          'pdf_no_text',
          'This PDF has no selectable text (it may be a scan). Paste the text instead.',
          400
        );
      }
    } else {
      let body: { text?: unknown };
      try {
        body = await request.json();
      } catch {
        return fail('invalid_request', 'Invalid JSON body', 400);
      }
      if (typeof body.text !== 'string') {
        return fail('invalid_request', 'Field "text" must be a string', 400);
      }
      text = body.text;
    }

    text = normalizeCvText(text);
    if (text.length < MIN_TEXT_CHARS) {
      return fail('too_short', 'Please paste more of your CV (at least 100 characters).', 400);
    }
    if (text.length > MAX_TEXT_CHARS) {
      return fail(
        'too_long',
        'That CV is too long to read in one pass. Paste only the sections you want imported.',
        400
      );
    }

    const config = aiConfig();
    const cookieStore = await cookies();
    const supabase = await createRouteClient(cookieStore);

    // shortcut: no per-user import cap — imports record cost but not a
    // generation, so the global ceiling is the only bound. Add a monthly
    // import counter if open signup brings abuse.
    const currentCost = await globalLlmCost(supabase, monthKey(new Date()));
    if (currentCost >= config.monthlyCostCeilingMicros) {
      return fail('budget_exhausted', 'AI reading is paused while this month’s AI budget recovers.', 400);
    }

    let draft;
    try {
      draft = await createGenAI().extractCv(text);
    } catch (error) {
      if (error instanceof CvNotParseableError) {
        return fail(
          'not_a_cv',
          'We could not read this as a CV. Check that you pasted the whole document and try again.',
          400
        );
      }
      throw error;
    }

    const result = finalizeCvDraft(draft);

    // Spend-only ledger entry: import must reach the global budget breaker
    // without consuming the monthly CV-generation cap. Best-effort — a ledger
    // failure must not throw away an extraction the user already paid for.
    try {
      const tokens = {
        input: Math.ceil(text.length / 4) + 800,
        output: result.items.length * 120 + 300,
      };
      await recordGeneration(
        supabase,
        user.id,
        estimateCostMicros(config.extractionModel, tokens),
        new Date(),
        0
      );
    } catch (error) {
      console.error('CV import cost recording failed:', error);
    }

    return NextResponse.json({ draft: result }, { status: 200 });
  } catch (error) {
    console.error('CV import error:', error);
    return fail('internal_error', 'An unexpected error occurred', 500);
  }
}