import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Block, Post, Reaction } from '../models/index.js';
import { listReactions } from '../services/post.service.js';

describe('post reaction people', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns people with their reaction and per-type totals', async () => {
    const postId = new mongoose.Types.ObjectId(), viewerId = String(new mongoose.Types.ObjectId());
    const personId = new mongoose.Types.ObjectId(), createdAt = new Date('2026-10-21T10:00:00Z');
    vi.spyOn(Post, 'findOne').mockReturnValue({ lean: async () => ({ _id: postId, authorId: viewerId }) } as any);
    vi.spyOn(Block, 'find').mockReturnValue({ select: () => ({ lean: async () => [] }) } as any);
    vi.spyOn(Reaction, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ populate: () => ({ lean: async () => [{ _id: new mongoose.Types.ObjectId(), type: 'love', createdAt, userId: { _id: personId, username: 'maya', displayName: 'Maya Chen', profile: { avatarUrl: '/maya.jpg' }, deletedAt: null } }] }) }) })
    } as any);
    vi.spyOn(Reaction, 'aggregate').mockResolvedValue([{ _id: 'love', count: 3 }, { _id: 'like', count: 2 }] as any);

    const result = await listReactions(viewerId, String(postId), 'love', null);

    expect(result.counts).toMatchObject({ all: 5, like: 2, love: 3, haha: 0, wow: 0, sad: 0, angry: 0 });
    expect(result.items).toEqual([{ type: 'love', createdAt, user: { _id: personId, username: 'maya', displayName: 'Maya Chen', avatarUrl: '/maya.jpg' } }]);
    expect(result.next).toBeNull();
  });

  it('rejects an unknown reaction filter', async () => {
    const postId = new mongoose.Types.ObjectId(), viewerId = String(new mongoose.Types.ObjectId());
    vi.spyOn(Post, 'findOne').mockReturnValue({ lean: async () => ({ _id: postId, authorId: viewerId }) } as any);
    await expect(listReactions(viewerId, String(postId), 'fire', null)).rejects.toMatchObject({ code: 'INVALID_REACTION_TYPE' });
  });
});
