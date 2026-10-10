import mongoose from 'mongoose';
import { Follow, GroupMember, Post, Reaction } from '../models/index.js';
import { env } from '../config/env.js';
import { cacheGet, cacheSet } from './cache.service.js';
import { blockedUserIds, feedExclusions, restrictedAuthorIds } from './social.service.js';

export async function getFeed(userId: string, page = 1, limit = 15) {
  const key = `feed:${userId}:${page}:${limit}`;
  const cached = await cacheGet<any[]>(key);
  if (cached) return { items: cached, cached: true };
  const [follows, memberships, excluded, restricted] = await Promise.all([
    Follow.find({ followerId: userId }).sort({ createdAt: -1, _id: -1 }).select('followingId').lean(),
    GroupMember.find({ userId }).select('groupId').lean(),
    feedExclusions(userId), restrictedAuthorIds(userId)
  ]);
  const following = follows.map((item: any) => item.followingId);
  const groupIds = memberships.map((item: any) => item.groupId);
  const objectIds = (ids: string[]) => ids.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await Post.aggregate([
    { $match: {
      deletedAt: null, groupStatus: { $nin: ['pending', 'declined'] }, authorId: { $nin: objectIds(excluded) },
      $or: [
        { authorId: new mongoose.Types.ObjectId(userId), groupId: null },
        { groupId: null, visibility: 'public' },
        { authorId: { $in: following, $nin: objectIds(restricted) }, groupId: null, visibility: 'followers' },
        { groupId: { $in: groupIds } }
      ]
    } },
    { $addFields: { _followOrder: { $let: {
      vars: { position: { $indexOfArray: [following, '$authorId'] } },
      in: { $cond: [{ $gte: ['$$position', 0] }, '$$position', following.length] }
    } } } },
    // Follow priority is applied before pagination, including older posts by a newly followed author.
    { $sort: { _followOrder: 1, createdAt: -1, _id: -1 } },
    { $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _followOrder: 0 } }
  ]);
  const selected = await Post.populate(rows, [
    { path: 'authorId', select: 'username displayName profile.avatarUrl' },
    { path: 'groupId', select: 'name slug' }
  ]);
  const reactions = await Reaction.find({ userId, postId: { $in: selected.map((post: any) => post._id) } }).lean();
  const mine = new Map(reactions.map((item: any) => [String(item.postId), item.type]));
  const items = selected.filter((post: any) => post.authorId).map((post: any) => ({ ...post, myReaction: mine.get(String(post._id)) || null }));
  await cacheSet(key, items, 45);
  return { items, cached: false };
}

export async function searchAll(query: string, viewerId?: string) {
  const response = await fetch(`${env.FASTAPI_URL}/v1/search?q=${encodeURIComponent(query)}&limit=24`);
  if (!response.ok) throw new Error('Search service unavailable');
  const result: any = await response.json();
  if (!viewerId) return result;
  const blocked = new Set(await blockedUserIds(viewerId));
  const postIds = result.items.filter((item: any) => item.kind === 'post').map((item: any) => item.id);
  const posts = postIds.length ? await Post.find({ _id: { $in: postIds }, authorId: { $nin: [...blocked] } }).select('_id').lean() : [];
  const visiblePosts = new Set(posts.map((post: any) => String(post._id)));
  return { ...result, items: result.items.filter((item: any) => item.kind === 'user' ? !blocked.has(String(item.id)) : item.kind !== 'post' || visiblePosts.has(String(item.id))) };
}
