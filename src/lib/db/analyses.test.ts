import { describe, expect, it } from 'vitest';
import { getRunningForJd } from './analyses';
import { createSupaStub } from '@/test-helpers/supa-stub';

describe('getRunningForJd', () => {
  it('expires stale running rows before reading the live one', async () => {
    const supa = createSupaStub({
      from: { match_analyses: { data: null, error: null } },
    });

    await getRunningForJd(supa as never, 'jd-1');

    const update = supa.calls.from.find((c) => c.method === 'update');
    expect(update?.table).toBe('match_analyses');
    expect(update?.args).toMatchObject({ status: 'failed' });
    // the sweep is bounded by updated_at + filtered to this JD's running rows
    expect(
      supa.calls.from.some((c) => c.method === 'lt' && c.args?.column === 'updated_at')
    ).toBe(true);
    const eqColumns = supa.calls.from.filter((c) => c.method === 'eq').map((c) => c.args?.column);
    expect(eqColumns).toEqual(expect.arrayContaining(['jd_id', 'status']));
  });

  it('throws when the expiry update fails (never silently skips the sweep)', async () => {
    const supa = createSupaStub({
      from: { match_analyses: { data: null, error: { code: 'DB', message: 'Database error' } } },
    });

    await expect(getRunningForJd(supa as never, 'jd-1')).rejects.toThrow('Database error');
  });
});
