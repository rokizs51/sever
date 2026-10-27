import { describe, it, expect } from 'vitest';
import {
  monthKey,
  GENERATIONS_CAP,
  recordGeneration,
  reserveGeneration,
  releaseGeneration,
} from './quota';
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

  describe('reserveGeneration', () => {
    it('returns true when the reservation succeeds', async () => {
      const supa = createSupaStub({ rpc: { reserve_generation: { data: 50, error: null } } });

      await expect(reserveGeneration(supa as never)).resolves.toBe(true);
      expect(supa.calls.rpc).toEqual([{ fn: 'reserve_generation', params: undefined }]);
    });

    it('maps the QT429 cap error to false, not an exception', async () => {
      const supa = createSupaStub({
        rpc: {
          reserve_generation: {
            data: null,
            error: { code: 'QT429', message: 'monthly generation cap reached' },
          },
        },
      });

      await expect(reserveGeneration(supa as never)).resolves.toBe(false);
    });

    it('rethrows other RPC errors', async () => {
      const supa = createSupaStub({
        rpc: { reserve_generation: { data: null, error: { code: 'DB_ERROR', message: 'Database error' } } },
      });

      await expect(reserveGeneration(supa as never)).rejects.toThrow('Database error');
    });
  });

  describe('releaseGeneration', () => {
    it('calls the RPC', async () => {
      const supa = createSupaStub();

      await releaseGeneration(supa as never);

      expect(supa.calls.rpc).toEqual([{ fn: 'release_generation', params: undefined }]);
    });

    it('never throws — it runs on failure paths', async () => {
      const supa = createSupaStub({
        rpc: { release_generation: { data: null, error: { code: 'DB_ERROR', message: 'Database error' } } },
      });

      await expect(releaseGeneration(supa as never)).resolves.toBeUndefined();
    });
  });
});
