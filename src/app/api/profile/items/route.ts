import { NextResponse, connection } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteClient } from '@/lib/db/client';
import { getSessionUser } from '@/lib/auth/session';
import { getOrCreateProfile } from '@/lib/db/profiles';
import { listItems, createItem, createItems } from '@/lib/db/items';
import { PAYLOAD_SCHEMAS, ITEM_TYPES } from '@/lib/domain/schemas';
import { canonicalTextFor } from '@/lib/domain/canonical';
import { fieldHint } from '@/lib/domain/validation';
import { fieldLabelFor } from '@/components/profile/fields';
import type { ItemType } from '@/lib/domain/types';

export async function GET() {
  // Session read → request-only (see resumes/route.ts for rationale).
  await connection();
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();
    const supabase = await createRouteClient(cookieStore);
    const profile = await getOrCreateProfile(supabase, user.id);
    const items = await listItems(supabase, profile.id);

    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    console.error('Profile items fetch error:', error);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    let body: { type?: unknown; payload?: unknown; payloads?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Invalid JSON body' } },
        { status: 400 }
      );
    }

    const { type, payload, payloads } = body;
    if (typeof type !== 'string' || !(ITEM_TYPES as string[]).includes(type)) {
      return NextResponse.json(
        { error: { code: 'invalid_type', message: 'Unknown entry type' } },
        { status: 400 }
      );
    }

    // Batch shape { type, payloads: [...] } (payloads wins if both are sent)
    // lets the skills queue save everything in one call.
    // shortcut: cap is 100/batch, raise it if paste-in flows need more.
    const isBatch = payloads !== undefined;
    if (isBatch && (!Array.isArray(payloads) || payloads.length === 0 || payloads.length > 100)) {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'payloads must be an array of 1-100 entries' } },
        { status: 400 }
      );
    }
    if (isBatch && type === 'career_snapshot') {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Career summary is added one at a time' } },
        { status: 400 }
      );
    }

    const rawList = isBatch ? (payloads as unknown[]) : [payload ?? {}];
    const parsedList: Record<string, unknown>[] = [];
    for (let i = 0; i < rawList.length; i++) {
      const parsed = PAYLOAD_SCHEMAS[type as ItemType].safeParse(rawList[i]);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: {
              code: 'invalid_payload',
              message: isBatch
                ? `Entry ${i + 1}: ${fieldHint(parsed.error.issues, fieldLabelFor(type as ItemType))}`
                : fieldHint(parsed.error.issues, fieldLabelFor(type as ItemType)),
            },
          },
          { status: 400 }
        );
      }
      parsedList.push(parsed.data);
    }

    const cookieStore = await cookies();
    const supabase = await createRouteClient(cookieStore);
    const profile = await getOrCreateProfile(supabase, user.id);

    const existing = await listItems(supabase, profile.id);

    // Exactly one career snapshot, enforced server-side (the headline CV
    // channel is singular: orchestrate renders the first as doc.summary and
    // additional ones would be invisible-but-editable).
    if (type === 'career_snapshot') {
      if (existing.some((i) => i.type === 'career_snapshot')) {
        return NextResponse.json(
          {
            error: {
              code: 'snapshot_exists',
              message: 'You already have a career summary. Edit it instead of adding another.',
            },
          },
          { status: 409 }
        );
      }
    }

    // New items append to one global counter (the import-commit convention),
    // so manual entries keep creation order instead of all landing at 0.
    const basePosition = existing.reduce((max, item) => Math.max(max, item.position), -1);

    if (isBatch) {
      const items = await createItems(
        supabase,
        profile.id,
        parsedList.map((data, index) => ({
          type: type as ItemType,
          payload: data,
          canonicalText: canonicalTextFor(type as ItemType, data),
          position: basePosition + 1 + index,
        }))
      );
      return NextResponse.json({ items }, { status: 201 });
    }

    const item = await createItem(supabase, profile.id, {
      type: type as ItemType,
      payload: parsedList[0],
      canonicalText: canonicalTextFor(type as ItemType, parsedList[0]),
      position: basePosition + 1,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error('Profile item create error:', error);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
