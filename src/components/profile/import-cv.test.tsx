import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { ProfileItem } from '@/lib/domain/types';
import type { FinalizedCvImport } from '@/lib/domain/cv-import';
import ImportCv from './import-cv';

const draft: FinalizedCvImport = {
  items: [
    { type: 'skill', payload: { name: 'React' }, canonicalText: 'React' },
  ],
  personal: {
    fullName: 'Alex Chen',
    email: 'alex@example.com',
    phone: null,
    location: null,
    links: [],
  },
  warnings: [],
};

function existingSkill(): ProfileItem {
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
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function openAndRead(length = 120) {
  fireEvent.click(screen.getByRole('button', { name: /import a cv/i }));
  fireEvent.change(screen.getByLabelText(/your cv/i), {
    target: { value: 'A'.repeat(length) },
  });
  fireEvent.click(screen.getByRole('button', { name: /read my cv/i }));
}

describe('ImportCv', () => {
  const fetchMock = vi.fn();
  global.fetch = fetchMock;

  beforeEach(() => {
    fetchMock.mockReset();
    cleanup();
  });

  it('reads a pasted CV, shows the review, and commits the selected entries', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ draft }))
      .mockResolvedValueOnce(
        jsonResponse({
          created: 1,
          skipped: { duplicates: 0, careerSummary: false },
          personalUpdated: false,
          personalSkipped: false,
        })
      );
    const onImported = vi.fn(async () => {});

    render(<ImportCv existingItems={[]} onImported={onImported} />);
    await openAndRead();

    expect(await screen.findByText(/we found 1 entry/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('React')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add 1 entry to my profile/i }));

    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(await screen.findByText(/added 1 entry/i)).toBeInTheDocument();

    const commitCall = fetchMock.mock.calls[1];
    expect(commitCall[0]).toBe('/api/profile/import/commit');
    const body = JSON.parse(commitCall[1].body);
    expect(body.items).toEqual([{ type: 'skill', payload: { name: 'React', level: '' } }]);
  });

  it('marks entries that already exist and refuses to import them', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ draft }));
    const onImported = vi.fn(async () => {});

    render(<ImportCv existingItems={[existingSkill()]} onImported={onImported} />);
    await openAndRead();

    expect(await screen.findByText('Already in your profile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add 0 entries/i })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});