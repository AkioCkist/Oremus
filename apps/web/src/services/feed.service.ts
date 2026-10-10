import { Follow, GroupMember, Post, Reaction } from '../models/index.js';
import { env } from '../config/env.js';
import { cacheGet, cacheSet } from './cache.service.js';

export async function getFeed(userId: string, page = 1, limit = 15) {
  const key = `feed:${userId}:${page}:${limit}`;
  const cached = await cacheGet<any[]>(key);
  if (cached) return { items: cached, cached: true };
  const [follows, memberships] = await Promise.all([
    Follow.find({ followerId: userId }).select('followingId').lean(),
    GroupMember.find({ userId }).select('groupId').lean()
  ]);
  const following = new Set(follows.map((item: any) => String(item.followingId)));
  const groupIds = memberships.map((item: any) => item.groupId);
  const candidates = await Post.find({ deletedAt: null, groupStatus: { $nin: ['pending', 'declined'] }, $or: [{ authorId: userId, groupId: null }, { groupId: null, visibility: 'public' }, { authorId: { $in: [...following] }, groupId: null, visibility: 'followers' }, { groupId: { $in: groupIds } }] })
    .sort({ createdAt: -1 }).limit(120).populate('authorId', 'username displayName profile.avatarUrl').populate('groupId', 'name slug').lean();
  const payload = candidates.map((post: any) => ({ post_id: String(post._id), author_id: String(post.authorId?._id || post.authorId), created_at: post.createdAt, reaction_count: post.reactionCount, comment_count: post.commentCount, is_following: following.has(String(post.authorId?._id || post.authorId)), is_group_member: post.groupId ? groupIds.some((id: any) => String(id) === String(post.groupId?._id || post.groupId)) : false }));
  let orderedIds: string[];
  try {
    const response = await fetch(`${env.FASTAPI_URL}/v1/feed/rank`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: userId, candidates: payload, limit: page * limit }) });
    if (!response.ok) throw new Error('rank unavailable');
    orderedIds = ((await response.json()) as Array<{ post_id: string }>).map((item) => item.post_id);
  } catch {
    orderedIds = candidates.map((post: any) => String(post._id));
  }
  const map = new Map(candidates.map((post: any) => [String(post._id), post]));
  const selected = orderedIds.slice((page - 1) * limit, page * limit).map((id) => map.get(id)).filter(Boolean);
  const reactions = await Reaction.find({ userId, postId: { $in: selected.map((post: any) => post._id) } }).lean();
  const mine = new Map(reactions.map((item: any) => [String(item.postId), item.type]));
  const items = selected.map((post: any) => ({ ...post, myReaction: mine.get(String(post._id)) || null }));
  await cacheSet(key, items, 45);
  return { items, cached: false };
}

export async function searchAll(query: string) {
  const response = await fetch(`${env.FASTAPI_URL}/v1/search?q=${encodeURIComponent(query)}&limit=24`);
  if (!response.ok) throw new Error('Search service unavailable');
  return response.json();
}
