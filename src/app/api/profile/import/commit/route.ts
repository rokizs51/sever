import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteClient } from '@/lib/db/client';
import { getSessionUser } from '@/lib/auth/session';
import { getOrCreateProfile, updatePersonal, type PersonalInfo } from '@/lib/db/profiles';
import { listItems, createItems } from '@/lib/db/items';
import { PAYLOAD_SCHEMAS, ITEM_TYPES, PersonalInfoSchema } from '@/lib/domain/schemas';
import { canonicalTextFor } from '@/lib/domain/canonical';
import { importKey, MAX_IMPORT_ITEMS } from '@/lib/domain/cv-import';
import { fieldHint } from '@/lib/domain/validation';
import type { ItemType } from '@/lib/domain/types';

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === '';
}

/**
 * Fill-empty-only merge: imported contact details may complete an empty
 * profile but can never overwrite a value the user already entered.
 */
function mergePersonal(existing: PersonalInfo, incoming: unknown): PersonalInfo {
  const inc = (typeof incoming === 'object' && incoming !== null ? incoming : {}) as Record<
    string,
    unknown
  >;
  const links = Array.isArray(inc.links)
    ? inc.links.filter((l): l is string => typeof l === 'string').map((l) => l.trim()).filter(Boolean)
    : [];
  const fill = (current: string | null, next: string): string | null =>
    isBlank(current) && next ? next : current;

  return {
    fullName: fill(existing.fullName, asString(inc.fullName)) ?? '',
    email: fill(existing.email, asString(inc.email)) ?? '',
    phone: fill(existing.phone, asString(inc.phone)),
    location: fill(existing.location, asString(inc.location)),
    links: existing.links.length === 0 ? [...new Set(links)] : existing.links,
  };
}

/**
 * POST /api/profile/import/commit — write the user-reviewed draft. Validates
 * every entry against the same strict schema the manual forms use, skips
 * duplicates of existing entries, and enforces the one-career-summary rule.
 * One insert: all entries land or none do.
 */
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail('unauthorized', 'Authentication required', 401);

    let body: { items?: unknown; personal?: unknown };
    try {
      body = await request.json();
    } catch {
      return fail('invalid_request', 'Invalid JSON body', 400);
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return fail('invalid_request', 'No entries were selected', 400);
    }
    if (body.items.length > MAX_IMPORT_ITEMS) {
      return fail('invalid_request', `At most ${MAX_IMPORT_ITEMS} entries can be imported at once`, 400);
    }

    const validated: { type: ItemType; payload: Record<string, unknown>; canonicalText: string }[] = [];
    for (let i = 0; i < body.items.length; i++) {
      const raw = body.items[i];
      const entry = (typeof raw === 'object' && raw !== null ? raw : {}) as {
        type?: unknown;
        payload?: unknown;
      };
      if (typeof entry.type !== 'string' || !(ITEM_TYPES as string[]).includes(entry.type)) {
        return fail('invalid_type', `Entry ${i + 1}: unknown entry type`, 400);
      }
      const type = entry.type as ItemType;
      const parsed = PAYLOAD_SCHEMAS[type].safeParse(entry.payload);
      if (!parsed.success) {
        return fail('invalid_payload', `Entry ${i + 1}: ${fieldHint(parsed.error.issues)}`, 400);
      }
      validated.push({
        type,
        payload: parsed.data,
        canonicalText: canonicalTextFor(type, parsed.data),
      });
    }

    const cookieStore = await cookies();
    const supabase = await createRouteClient(cookieStore);
    const profile = await getOrCreateProfile(supabase, user.id);
    const existing = await listItems(supabase, profile.id);

    const seen = new Set(existing.map((item) => importKey(item.canonicalText)));
    const hasSnapshot = existing.some((item) => item.type === 'career_snapshot');
    let duplicates = 0;
    let careerSummary = false;
    const toInsert: typeof validated = [];

    for (const item of validated) {
      if (item.type === 'career_snapshot' && hasSnapshot) {
        careerSummary = true;
        continue;
      }
      const key = importKey(item.canonicalText);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      toInsert.push(item);
    }

    const basePosition = existing.reduce((max, item) => Math.max(max, item.position), -1);
    if (toInsert.length > 0) {
      await createItems(
        supabase,
        profile.id,
        toInsert.map((item, index) => ({
          ...item,
          position: basePosition + 1 + index,
          source: 'import' as const,
        }))
      );
    }

    // Personal details are advisory: an invalid address or a DB hiccup here
    // must not discard entries that were already written.
    let personalUpdated = false;
    let personalSkipped = false;
    if (body.personal !== undefined) {
      const parsed = PersonalInfoSchema.safeParse(mergePersonal(profile.personal, body.personal));
      if (parsed.success) {
        if (JSON.stringify(parsed.data) !== JSON.stringify(profile.personal)) {
          try {
            await updatePersonal(supabase, user.id, parsed.data);
            personalUpdated = true;
          } catch (error) {
            console.error('CV import personal update failed:', error);
            personalSkipped = true;
          }
        }
      } else {
        personalSkipped = true;
      }
    }

    return NextResponse.json(
      {
        created: toInsert.length,
        skipped: { duplicates, careerSummary },
        personalUpdated,
        personalSkipped,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('CV import commit error:', error);
    return fail('internal_error', 'An unexpected error occurred', 500);
  }
}