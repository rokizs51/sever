import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteClient } from '@/lib/db/client';
import { getSessionUser } from '@/lib/auth/session';
import { getItem, updateItem, deleteItem, revertText } from '@/lib/db/items';
import { PAYLOAD_SCHEMAS } from '@/lib/domain/schemas';
import { canonicalTextFor, normalizeManualText } from '@/lib/domain/canonical';
import { fieldHint } from '@/lib/domain/validation';
import { fieldLabelFor } from '@/components/profile/fields';
import type { ProfileItem } from '@/lib/domain/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Item id must be a valid identifier' } },
        { status: 400 }
      );
    }

    let body: { payload?: unknown; canonicalText?: unknown; pinned?: unknown; position?: unknown; revertText?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Invalid JSON body' } },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = await createRouteClient(cookieStore);

    // RLS scopes reads to the session user: foreign/absent ids both → 404.
    const stored = await getItem(supabase, id);
    if (!stored) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Entry not found' } },
        { status: 404 }
      );
    }

    // Revert path: pops the last provenance entry (restores the previous
    // canonical text) — handled by the repository, nothing else applies.
    if (body.revertText === true) {
      const reverted = await revertText(supabase, id, stored);
      return NextResponse.json({ item: reverted }, { status: 200 });
    }

    const patch: {
      payload?: Record<string, unknown>;
      canonicalText?: string;
      pinned?: boolean;
      position?: number;
      provenance?: ProfileItem['provenance'];
    } = {};

    if (body.payload !== undefined) {
      const parsed = PAYLOAD_SCHEMAS[stored.type].safeParse(body.payload);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: {
              code: 'invalid_payload',
              message: fieldHint(parsed.error.issues, fieldLabelFor(stored.type)),
            },
          },
          { status: 400 }
        );
      }
      patch.payload = parsed.data;
      // A payload edit re-derives the rendered text; an explicit
      // canonicalText (manual line edit) wins over the derived form — but
      // per-line markers are stripped: the renderer owns the bullet marker,
      // so a hand-typed "• - x" can't stack markers at display time.
      patch.canonicalText =
        typeof body.canonicalText === 'string' && body.canonicalText.trim()
          ? normalizeManualText(body.canonicalText)
          : canonicalTextFor(stored.type, parsed.data);
    } else if (typeof body.canonicalText === 'string' && body.canonicalText.trim()) {
      patch.canonicalText = normalizeManualText(body.canonicalText);
    }

    // Provenance invariant: the chain snapshots the wording an accepted
    // rewrite replaced. A content edit (payload or manual text) makes those
    // snapshots stale — keeping them would let a later Revert restore text
    // from before this edit and silently undo it. Editing rebases the chain.
    const editingContent = patch.payload !== undefined || patch.canonicalText !== undefined;
    if (editingContent && stored.provenance.length > 0) {
      patch.provenance = [];
    }

    if (typeof body.pinned === 'boolean') {
      patch.pinned = body.pinned;
    }
    if (Number.isInteger(body.position)) {
      patch.position = body.position as number;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Nothing to update was sent' } },
        { status: 400 }
      );
    }

    await updateItem(supabase, id, patch);
    const fresh = await getItem(supabase, id);
    return NextResponse.json({ item: fresh ?? { ...stored, ...patch } }, { status: 200 });
  } catch (error) {
    console.error('Profile item update error:', error);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Item id must be a valid identifier' } },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = await createRouteClient(cookieStore);

    const stored = await getItem(supabase, id);
    if (!stored) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Entry not found' } },
        { status: 404 }
      );
    }

    // The headline channel is singular and required-by-design; the snapshot
    // is edited, never deleted (mirrors the POST single-snapshot guard).
    if (stored.type === 'career_snapshot') {
      return NextResponse.json(
        {
          error: {
            code: 'cannot_delete',
            message: 'Your career summary can be edited but not removed — every CV headline is built from it.',
          },
        },
        { status: 400 }
      );
    }

    await deleteItem(supabase, id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Profile item delete error:', error);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
