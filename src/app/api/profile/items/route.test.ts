import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupaStub } from '@/test-helpers/supa-stub';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

// GET calls connection() to force request-time rendering; it throws outside
// a Next request scope, so stub it here while keeping real NextResponse.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: vi.fn(async () => {}) };
});
vi.mock('@/lib/auth/session', () => ({ getSessionUser: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ createRouteClient: vi.fn() }));

import { GET, POST } from './route';
import { getSessionUser } from '@/lib/auth/session';
import { createRouteClient } from '@/lib/db/client';

const mockGetSessionUser = vi.mocked(getSessionUser);
const mockCreateRouteClient = vi.mocked(createRouteClient);

const profileRow = {
  data: {
    id: 'profile-1',
    user_id: 'user-1',
    personal: { fullName: 'Test User', email: 'test@example.com', phone: null, location: null, links: [] },
  },
  error: null,
};

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    profile_id: 'profile-1',
    type: 'skill',
    payload: { name: 'Go', level: 'advanced' },
    canonical_text: 'Go (advanced)',
    source: 'manual',
    provenance: [],
    pinned: false,
    position: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
});

describe('GET /api/profile/items', () => {
  it('returns 401 without a session', async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns the caller\'s items', async () => {
    const supa = createSupaStub({
      from: { profiles: profileRow, profile_items: { data: [itemRow()], error: null } },
    });
    mockCreateRouteClient.mockResolvedValue(supa as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].canonicalText).toBe('Go (advanced)');
  });
});

describe('POST /api/profile/items', () => {
  const post = (body: unknown) =>
    POST(new Request('http://localhost/api/profile/items', {
      method: 'POST',
      body: JSON.stringify(body),
    }));

  it('creates an item with server-derived canonicalText and returns 201', async () => {
    const supa = createSupaStub({
      from: {
        profiles: profileRow,
        profile_items: { data: [itemRow()], error: null },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as never);

    const res = await post({ type: 'skill', payload: { name: 'Go', level: 'advanced' } });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.item.canonicalText).toBe('Go (advanced)');
    const insert = supa.calls.from.find((c) => c.table === 'profile_items' && c.method === 'insert');
    expect(insert?.args).toMatchObject({
      profile_id: 'profile-1',
      type: 'skill',
      canonical_text: 'Go (advanced)',
      position: 1,
    });
  });

  it('assigns the next position after the highest existing one', async () => {
    const supa = createSupaStub({
      from: {
        profiles: profileRow,
        profile_items: { data: [itemRow({ position: 3 }), itemRow({ id: 'item-2', position: 7 })], error: null },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as never);

    const res = await post({ type: 'skill', payload: { name: 'Go', level: 'advanced' } });
    expect(res.status).toBe(201);

    const insert = supa.calls.from.find((c) => c.table === 'profile_items' && c.method === 'insert');
    expect(insert?.args).toMatchObject({ position: 8 });
  });

  it('rejects an unknown item type with 400', async () => {
    const supa = createSupaStub({ from: { profiles: profileRow } });
    mockCreateRouteClient.mockResolvedValue(supa as never);

    const res = await post({ type: 'not-a-type', payload: {} });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('invalid_type');
  });

  it('rejects a payload that fails its schema with 400 and creates nothing', async () => {
    const supa = createSupaStub({ from: { profiles: profileRow } });
    mockCreateRouteClient.mockResolvedValue(supa as never);

    const res = await post({ type: 'experience', payload: { company: 'Acme' } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('invalid_payload');
    expect(supa.calls.from.find((c) => c.method === 'insert')).toBeUndefined();
  });

  it('returns 401 without a session', async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await post({ type: 'skill', payload: { name: 'Go' } });
    expect(res.status).toBe(401);
  });

  it('enforces the single career_snapshot server-side with 409', async () => {
    const supa = createSupaStub({
      from: {
        profiles: profileRow,
        profile_items: { data: [itemRow({ id: 'snap-1', type: 'career_snapshot', canonical_text: 'Already here' })], error: null },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as never);

    const res = await post({ type: 'career_snapshot', payload: { text: 'A second headline' } });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('snapshot_exists');
    expect(supa.calls.from.find((c) => c.method === 'insert')).toBeUndefined();
  });

  it('creates a whole batch in one insert and returns 201', async () => {
    const rows = [
      itemRow(),
      itemRow({ id: 'item-2', payload: { name: 'Rust', level: 'Expert' }, canonical_text: 'Rust (Expert)' }),
    ];
    const supa = createSupaStub({
      from: { profiles: profileRow, profile_items: { data: rows, error: null } },
    });
    mockCreateRouteClient.mockResolvedValue(supa as never);

    const res = await post({
      type: 'skill',
      payloads: [{ name: 'Go', level: 'advanced' }, { name: 'Rust', level: 'Expert' }],
    });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.items).toHaveLength(2);
    const inserts = supa.calls.from.filter((c) => c.method === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args.map((r: Record<string, unknown>) => r.canonical_text)).toEqual([
      'Go (advanced)',
      'Rust (Expert)',
    ]);
    // Existing rows are position 0/0 → batch appends as 1 and 2.
    expect(inserts[0].args.map((r: Record<string, unknown>) => r.position)).toEqual([1, 2]);
  });

  it('rejects a batch whose entry fails the schema and inserts nothing', async () => {
    const supa = createSupaStub({ from: { profiles: profileRow } });
    mockCreateRouteClient.mockResolvedValue(supa as never);

    const res = await post({ type: 'skill', payloads: [{ name: 'Go' }, {}] });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('invalid_payload');
    expect(data.error.message).toContain('Entry 2');
    expect(supa.calls.from.find((c) => c.method === 'insert')).toBeUndefined();
  });

  it('rejects an empty batch and a career_snapshot batch with 400', async () => {
    expect((await post({ type: 'skill', payloads: [] })).status).toBe(400);
    expect((await post({ type: 'career_snapshot', payloads: [{ text: 'a' }, { text: 'b' }] })).status).toBe(400);
  });

  it('accepts a current job with an empty end date (end: "" is meaningful)', async () => {
    const supa = createSupaStub({
      from: {
        profiles: profileRow,
        profile_items: {
          data: [itemRow({ id: 'exp-1', type: 'experience', payload: { company: 'Acme', role: 'Dev', start: '2024', end: '', bullets: [] }, canonical_text: 'Dev — Acme (2024–present)' })],
          error: null,
        },
      },
    });
    mockCreateRouteClient.mockResolvedValue(supa as never);

    const res = await post({
      type: 'experience',
      payload: { company: 'Acme', role: 'Dev', start: '2024', end: '', bullets: [] },
    });

    expect(res.status).toBe(201);
  });
});
