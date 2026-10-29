import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ItemEditor from './item-editor';
import type { ProfileItem } from '@/lib/domain/types';

function makeItem(overrides: Partial<ProfileItem> = {}): ProfileItem {
  return {
    id: 'item-1',
    profileId: 'profile-1',
    type: 'skill',
    payload: { name: 'Go', level: 'advanced' },
    canonicalText: 'Go (advanced)',
    source: 'manual',
    provenance: [],
    pinned: false,
    position: 0,
    ...overrides,
  };
}

beforeEach(() => cleanup());

describe('ItemEditor', () => {
  it('renders the payload fields with current values', () => {
    render(<ItemEditor item={makeItem()} onPatch={vi.fn()} />);

    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Go');
    expect((screen.getByLabelText(/level/i) as HTMLInputElement).value).toBe('advanced');
  });

  it('saves edited payload', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(<ItemEditor item={makeItem()} onPatch={onPatch} />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Rust' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(onPatch).toHaveBeenCalledWith({ payload: { name: 'Rust', level: 'advanced' } })
    );
  });

  it('two provenance entries → Enhanced badge, Revert sends { revertText: true } once', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const item = makeItem({
      provenance: [
        { text: 'v2', originalText: 'v1', fromResumeId: 'r1', at: '2026-10-01T00:00:00Z' },
        { text: 'v3', originalText: 'v2', fromResumeId: 'r2', at: '2026-10-02T00:00:00Z' },
      ],
    });
    render(<ItemEditor item={item} onPatch={onPatch} />);

    screen.getByText(/enhanced/i);
    fireEvent.click(screen.getByRole('button', { name: /revert/i }));

    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1));
    expect(onPatch).toHaveBeenCalledWith({ revertText: true });
  });

  it('no provenance → no badge, no revert button', () => {
    render(<ItemEditor item={makeItem()} onPatch={vi.fn()} />);
    expect(screen.queryByText(/enhanced/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revert/i })).not.toBeInTheDocument();
  });

  it('pin toggle sends { pinned: true } and never touches canonicalText', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(<ItemEditor item={makeItem({ pinned: false })} onPatch={onPatch} />);

    fireEvent.click(screen.getByRole('button', { name: /pin/i }));

    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1));
    const body = onPatch.mock.calls[0][0];
    expect(body).toEqual({ pinned: true });
    expect(body).not.toHaveProperty('canonicalText');
  });

  it('unpin sends { pinned: false }', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(<ItemEditor item={makeItem({ pinned: true })} onPatch={onPatch} />);

    fireEvent.click(screen.getByRole('button', { name: /unpin/i }));

    await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ pinned: false }));
  });

  it('experience bullets are edited as one-per-line text', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const item = makeItem({
      type: 'experience',
      payload: { company: 'Acme', role: 'Dev', start: '2022', end: '2025', bullets: ['Shipped X', 'Led Y'] },
    });
    render(<ItemEditor item={item} onPatch={onPatch} />);

    const bullets = screen.getByLabelText(/bullet/i) as HTMLTextAreaElement;
    expect(bullets.value).toBe('Shipped X\nLed Y');

    fireEvent.change(bullets, { target: { value: 'Shipped X\nLed Y\nRan Z' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(onPatch).toHaveBeenCalledWith({
        payload: {
          company: 'Acme',
          role: 'Dev',
          start: '2022',
          end: '2025',
          location: '',
          employmentType: '',
          bullets: ['Shipped X', 'Led Y', 'Ran Z'],
          technologies: [],
        },
      })
    );
  });

  it('delete asks for an inline confirm; Cancel aborts, confirm calls onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<ItemEditor item={makeItem()} onPatch={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});
