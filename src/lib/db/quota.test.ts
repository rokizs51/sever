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
    it('records spend through the record_usage RPC without consuming a generation', async () => {
      const supa = createSupaStub();

      await recordGeneration(supa as never, 42, 0);

      expect(supa.calls.rpc).toEqual([
        { fn: 'record_usage', params: { p_cost: 42, p_generations: 0 } },
      ]);
      expect(supa.calls.from).toEqual([]);
    });
  });
});
