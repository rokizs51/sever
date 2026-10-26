import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentUsage, recordGeneration } from './quota';
import { acceptText, revertText, updateItem } from './items';
import { updatePersonal } from './profiles';
import { updateResumeFields, getResume } from './resumes';
import type { ProfileItem } from '../domain/types';

// Mock Supabase client that returns errors
function createErrorClient(error: { message: string; code: string }): SupabaseClient {
  const errorResult = { data: null, error };
  
  // Create a chainable object that supports multiple .eq() calls and resolves to errorResult when awaited
  const createChainable = (): any => {
    const chainable: any = {
      eq: () => createChainable(),
      select: () => Promise.resolve(errorResult),
      single: () => Promise.resolve(errorResult),
      then: (resolve: any) => resolve(errorResult),
    };
    return chainable;
  };
  
  const mockFrom = () => ({
    select: () => createChainable(),
    update: () => createChainable(),
    insert: () => Promise.resolve(errorResult),
  });

  const mockRpc = () => Promise.resolve(errorResult);

  return { from: mockFrom, rpc: mockRpc } as unknown as SupabaseClient;
}

describe('Repository error handling', () => {
  const dbError = { message: 'Database error', code: 'DB_ERROR' };
  const notFoundError = { message: 'No rows found', code: 'PGRST116' };

  describe('quota', () => {
    it('currentUsage throws on database errors', async () => {
      const supa = createErrorClient(dbError);
      await expect(currentUsage(supa, 'user-123')).rejects.toThrow('Database error');
    });

    it('currentUsage returns zero usage when no rows found', async () => {
      const supa = createErrorClient(notFoundError);
      const result = await currentUsage(supa, 'user-123');
      expect(result).toEqual({ generations: 0, llmCostMicros: 0 });
    });

    it('recordGeneration throws on RPC error', async () => {
      const supa = createErrorClient(dbError);
      await expect(recordGeneration(supa, 1000)).rejects.toThrow('Database error');
    });
  });

  describe('items', () => {
    const mockItem: ProfileItem = {
      id: 'item-1',
      profileId: 'profile-1',
      type: 'experience',
      canonicalText: 'Original text',
      position: 0,
      pinned: false,
      payload: {},
      source: 'manual',
      provenance: [],
    };

    it('updateItem throws on database error', async () => {
      const supa = createErrorClient(dbError);
      await expect(updateItem(supa, 'item-1', { canonicalText: 'New text' })).rejects.toThrow('Database error');
    });

    it('acceptText throws on database error', async () => {
      const supa = createErrorClient(dbError);
      await expect(
        acceptText(supa, 'item-1', mockItem, 'New text', 'resume-1')
      ).rejects.toThrow('Database error');
    });

    it('revertText throws on database error', async () => {
      const supa = createErrorClient(dbError);
      await expect(revertText(supa, 'item-1', mockItem)).rejects.toThrow('Database error');
    });
  });

  describe('profiles', () => {
    it('updatePersonal throws on database error', async () => {
      const supa = createErrorClient(dbError);
      const personal = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: null,
        location: null,
        links: [],
      };
      await expect(updatePersonal(supa, 'user-123', personal)).rejects.toThrow('Database error');
    });
  });

  describe('resumes', () => {
    it('updateResumeFields throws on database error', async () => {
      const supa = createErrorClient(dbError);
      await expect(
        updateResumeFields(supa, 'resume-1', { userEdits: { 'item-1': 'Edited bullet text' } })
      ).rejects.toThrow('Database error');
    });

    it('getResume throws on database errors (never conflated with not-found)', async () => {
      const supa = createErrorClient(dbError);
      await expect(getResume(supa, '11111111-1111-4111-8111-111111111111')).rejects.toThrow(
        'Database error'
      );
    });

    it('getResume returns null only for a genuinely absent row (PGRST116)', async () => {
      const supa = createErrorClient(notFoundError);
      await expect(getResume(supa, '11111111-1111-4111-8111-111111111111')).resolves.toBeNull();
    });
  });

});
