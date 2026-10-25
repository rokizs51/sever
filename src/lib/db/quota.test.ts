import { describe, it, expect } from 'vitest';
import { monthKey, GENERATIONS_CAP, recordGeneration } from './quota';
import { createSupaStub } from '@/test-helpers/supa-stub';

describe('quota', () => {
  describe('monthKey', () => {
    it('returns YYYY-MM format for a given date', () => {
      const date = new Date('2026-10-15T23:30:00Z');
      expect(monthKey(date)).toBe('2026-10');
    });

    it('handles year boundaries correctly', () => {
      const date = new Date('2025-12-31T23:59:59Z');
      expect(monthKey(date)).toBe('2025-12');
    });

    it('handles start of year', () => {
      const date = new Date('2026-01-01T00:00:00Z');
      expect(monthKey(date)).toBe('2026-01');
    });

    it('uses UTC timezone', () => {
      // 2026-10-15T23:30:00Z is still October in UTC
      const date = new Date('2026-10-15T23:30:00Z');
      expect(monthKey(date)).toBe('2026-10');
    });
  });

  describe('GENERATIONS_CAP', () => {
    it('is 50', () => {
      expect(GENERATIONS_CAP).toBe(50);
    });
  });

  describe('recordGeneration', () => {
    it('records spend without consuming a generation when generations=0', async () => {
      const supa = createSupaStub({
        from: { generation_quota: { data: null, error: null } },
      });

      await recordGeneration(supa as never, 'user-1', 42, new Date('2026-10-15T12:00:00Z'), 0);

      const insert = supa.calls.from.find((call) => call.method === 'insert');
      expect(insert?.args).toMatchObject({
        user_id: 'user-1',
        month: '2026-10',
        generations: 0,
        llm_cost_micros: 42,
      });
    });
  });
});
