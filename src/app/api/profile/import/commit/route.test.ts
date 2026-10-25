// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProfileItem } from '@/lib/domain/types';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({})),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  createRouteClient: vi.fn(async () => ({})),
}));

vi.mock('@/lib/db/profiles', () => ({
  getOrCreateProfile: vi.fn(),
  updatePersonal: vi.fn(),
}));

vi.mock('@/lib/db/items', () => ({
  listItems: vi.fn(),
  createItems: vi.fn(),
}));

import { POST } from './route';
import { getSessionUser } from '@/lib/auth/session';
import { getOrCreateProfile, updatePersonal } from '@/lib/db/profiles';
import { listItems, createItems } from '@/lib/db/items';
import type { PersonalInfo } from '@/lib/db/profiles';

const mockGetSessionUser = vi.mocked(getSessionUser);
const mockGetOrCreateProfile = vi.mocked(getOrCreateProfile);
const mockUpdatePersonal = vi.mocked(updatePersonal);
const mockListItems = vi.mocked(listItems);
const mockCreateItems = vi.mocked(createItems);

const emptyPersonal: PersonalInfo = {
  fullName: '',
  email: '',
  phone: null,
  location: null,
  links: [],
};

function existingItem(overrides: Partial<ProfileItem> = {}): ProfileItem {
  return {
    id: 'item-1',
    profileId: 'profile-1',
    type: 'skill',
    payload: { name: 'React' },
    canonicalText: 'React',
    source: 'manual',
    provenance: [],
    pinned: false,
    position: 0,
    ...overrides,
  };
}

function request(body: unknown) {
  return new Request('http://localhost/api/profile/import/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const project = {
  type: 'project',
  payload: { name: 'Thing', description: 'Does it', tech: ['Go'] },
};

describe('POST /api/profile/import/commit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    mockGetOrCreateProfile.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      personal: emptyPersonal,
    });
    mockListItems.mockResolvedValue([]);
    mockCreateItems.mockResolvedValue([]);
    mockUpdatePersonal.mockResolvedValue(undefined);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const response = await POST(request({ items: [project] }));

    expect(response.status).toBe(401);
    expect(mockCreateItems).not.toHaveBeenCalled();
  });

  it('rejects a payload that fails the strict schema', async () => {
    const response = await POST(
      request({ items: [{ type: 'experience', payload: { role: 'Dev' } }] })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_payload');
    expect(mockCreateItems).not.toHaveBeenCalled();
  });

  it('skips entries that already exist in the profile', async () => {
    mockListItems.mockResolvedValue([existingItem()]);

    const response = await POST(request({ items: [{ type: 'skill', payload: { name: 'React' } }] }));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.created).toBe(0);
    expect(data.skipped.duplicates).toBe(1);
    expect(mockCreateItems).not.toHaveBeenCalled();
  });

  it('never adds a second career summary', async () => {
    mockListItems.mockResolvedValue([
      existingItem({ type: 'career_snapshot', payload: { text: 'Mine' }, canonicalText: 'Mine' }),
    ]);

    const response = await POST(
      request({ items: [{ type: 'career_snapshot', payload: { text: 'Imported' } }] })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.created).toBe(0);
    expect(data.skipped.careerSummary).toBe(true);
    expect(mockCreateItems).not.toHaveBeenCalled();
  });

  it('inserts new entries with source=import and positions after the last item', async () => {
    mockListItems.mockResolvedValue([existingItem({ position: 4 })]);

    const response = await POST(request({ items: [project] }));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.created).toBe(1);
    expect(mockCreateItems).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      [
        expect.objectContaining({
          type: 'project',
          canonicalText: 'Thing — Does it (Go)',
          position: 5,
          source: 'import',
        }),
      ]
    );
  });

  it('fills only empty personal fields and never overwrites existing values', async () => {
    mockGetOrCreateProfile.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      personal: { ...emptyPersonal, fullName: 'Existing Name', email: 'me@example.com' },
    });

    const response = await POST(
      request({
        items: [project],
        personal: {
          fullName: 'Imported Name',
          email: 'other@example.com',
          phone: '+1 555 0100',
          location: 'Berlin',
          links: ['https://github.com/me'],
        },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.personalUpdated).toBe(true);
    expect(mockUpdatePersonal).toHaveBeenCalledWith(expect.anything(), 'user-1', {
      fullName: 'Existing Name',
      email: 'me@example.com',
      phone: '+1 555 0100',
      location: 'Berlin',
      links: ['https://github.com/me'],
    });
  });

  it('skips invalid contact details without discarding the imported entries', async () => {
    const response = await POST(
      request({
        items: [project],
        personal: { fullName: 'Alex', email: 'not-an-email' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.created).toBe(1);
    expect(data.personalSkipped).toBe(true);
    expect(mockUpdatePersonal).not.toHaveBeenCalled();
    expect(mockCreateItems).toHaveBeenCalled();
  });
});