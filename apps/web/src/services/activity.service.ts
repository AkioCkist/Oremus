import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { Follow, Group, GroupMember, Interaction, Post, Story, User } from '../models/index.js';
import { groupText, postText, queryText, storyText, userText } from '../recommender/documents.js';
import { MIN_DWELL_MS, type Signal, type SignalType, type TargetType } from '../recommender/engine.js';
import { analyze, topFeatures } from '../recommender/text.js';
import { invalidateCacheKeys } from './cache.service.js';
import { assertCanAccessPost } from './post.service.js';
import { canViewStory } from './story.service.js';
import { blockedUserIds } from './social.service.js';

/**
 * Behaviour tracking for recommendations. Pages and API handlers call `trackSignal` (fire-and-forget);
 * the browser reports reading time and in-post clicks through `recordClientEvents`.
 * A signal is only stored when the user may see the target, and never for their own content.
 */

export type SignalInput = { type: SignalType; targetType: TargetType; targetId?: string; query?: string; durationMs?: number };
export type ClientEvent = { type: 'dwell'; postId: string; ms: number } | { type: 'click'; target: 'post' | 'user' | 'group' | 'story'; id: string };

const SIGNAL_WINDOW_DAYS = 90;
const SIGNAL_LOAD_LIMIT = 600;
const DWELL_MAX_MS = 10 * 60_000;
/** Reloading a page or re-opening the same thing within this window is not a new signal. */
const REPEAT_WINDOW_MS: Partial<Record<SignalType, number>> = { open: 10 * 60_000, click: 60_000, search: 2 * 60_000, story_view: 30 * 60_000, follow: 60 * 60_000, join: 60 * 60_000 };
const RECENT_POSTS = 10;
const LABEL_LIMIT = 80;

export const recommendationCacheKey = (userId: string) => `rec:${userId}`;
const isId = (value: unknown): value is string => typeof value === 'string' && mongoose.isValidObjectId(value) && /^[a-f0-9]{24}$/i.test(value);
const snippet = (text: string) => { const clean = String(text || '').replace(/\s+/g, ' ').trim(); return clean.length > LABEL_LIMIT ? `${clean.slice(0, LABEL_LIMIT - 1)}…` : clean; };

type Resolved = { authorId?: unknown; groupId?: unknown; label: string; features: ReturnType<typeof topFeatures> };

async function recentPublicPosts(filter: Record<string, unknown>) {
  const rows = await Post.find({ deletedAt: null, groupStatus: 'approved', ...filter }).sort({ createdAt: -1 }).limit(RECENT_POSTS).select('content').lean();
  return rows.map((row: any) => row.content || '').filter(Boolean);
}

async function resolvePost(userId: string, postId: string): Promise<Resolved | null> {
  const post: any = await Post.findOne({ _id: postId, deletedAt: null }).lean();
  if (!post || String(post.authorId) === userId) return null;
  try { await assertCanAccessPost(post, userId); } catch { return null; }
  const [group, shared]: any[] = await Promise.all([
    post.groupId ? Group.findById(post.groupId).select('name tags').lean() : null,
    post.sharedPostId ? Post.findOne({ _id: post.sharedPostId, deletedAt: null, visibility: 'public', groupId: null }).select('content').lean() : null
  ]);
  return { authorId: post.authorId, groupId: post.groupId, label: snippet(post.content || shared?.content || ''), features: topFeatures(analyze(postText(post, group, shared))) };
}

async function resolveUser(userId: string, targetId: string): Promise<Resolved | null> {
  if (targetId === userId) return null;
  const [user, blocked]: any[] = await Promise.all([User.findOne({ _id: targetId, deletedAt: null }).lean(), blockedUserIds(userId)]);
  if (!user || blocked.includes(targetId)) return null;
  const posts = await recentPublicPosts({ authorId: targetId, groupId: null, visibility: 'public' });
  return { authorId: targetId, label: user.displayName, features: topFeatures(analyze(userText(user, posts))) };
}

async function resolveGroup(userId: string, groupId: string): Promise<Resolved | null> {
  const group: any = await Group.findById(groupId).lean();
  if (!group) return null;
  const member = await GroupMember.exists({ groupId, userId });
  if (group.visibility === 'hidden' && !member) return null;
  const posts = group.privacy === 'public' || member ? await recentPublicPosts({ groupId }) : [];
  return { groupId, label: group.name, features: topFeatures(analyze(groupText(group, posts))) };
}

async function resolveStory(userId: string, storyId: string): Promise<Resolved | null> {
  const story: any = await Story.findOne({ _id: storyId, deletedAt: null, expiresAt: { $gt: new Date() } }).lean();
  if (!story || String(story.authorId) === userId) return null;
  const [author, blocked, follows]: any[] = await Promise.all([
    User.findOne({ _id: story.authorId, deletedAt: null }).lean(), blockedUserIds(userId),
    story.audience === 'public' ? [] : Follow.find({ followerId: userId, followingId: story.authorId }).select('followingId').lean()
  ]);
  if (!author || blocked.includes(String(story.authorId))) return null;
  if (!canViewStory(story, userId, new Set(follows.map((row: any) => String(row.followingId))))) return null;
  return { authorId: story.authorId, label: author.displayName, features: topFeatures(analyze(storyText(story, author))) };
}

const normalizeLabel = (query: string) => String(query || '').trim().replace(/\s+/g, ' ').slice(0, LABEL_LIMIT);

function resolveQuery(query: string): Resolved | null {
  const label = normalizeLabel(query);
  if (label.length < 2) return null;
  const features = topFeatures(analyze(queryText(label)));
  return features.length ? { label, features } : null;
}

async function resolve(userId: string, input: SignalInput): Promise<Resolved | null> {
  if (input.targetType === 'query') return resolveQuery(input.query || '');
  if (!isId(input.targetId)) return null;
  switch (input.targetType) {
    case 'post': return resolvePost(userId, input.targetId);
    case 'user': return resolveUser(userId, input.targetId);
    case 'group': return resolveGroup(userId, input.targetId);
    case 'story': return resolveStory(userId, input.targetId);
    default: return null;
  }
}

/** Stores one signal. Returns whether it was kept. */
export async function recordSignal(userId: string, input: SignalInput): Promise<boolean> {
  if (!isId(userId)) return false;
  const durationMs = input.type === 'dwell' ? Math.min(Math.max(Math.round(input.durationMs || 0), 0), DWELL_MAX_MS) : 0;
  if (input.type === 'dwell' && durationMs < MIN_DWELL_MS) return false;
  const window = REPEAT_WINDOW_MS[input.type];
  if (window) {
    const recent = { userId, type: input.type, targetType: input.targetType, createdAt: { $gte: new Date(Date.now() - window) } };
    const repeat = input.targetType === 'query'
      ? await Interaction.exists({ ...recent, label: new RegExp(`^${normalizeLabel(input.query || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      : await Interaction.exists({ ...recent, targetId: input.targetId });
    if (repeat) return false;
  }
  const resolved = await resolve(userId, input);
  if (!resolved) return false;
  await Interaction.create({
    userId, type: input.type, targetType: input.targetType, targetId: input.targetType === 'query' ? null : input.targetId,
    authorId: resolved.authorId || null, groupId: resolved.groupId || null, label: resolved.label, durationMs, features: resolved.features
  });
  await invalidateCacheKeys([recommendationCacheKey(userId)]);
  return true;
}

/** Records a signal without delaying or failing the request that triggered it. */
export function trackSignal(userId: string | undefined, input: SignalInput): void {
  if (!userId) return;
  void recordSignal(userId, input).catch((error) => logger.warn({ error, signal: input.type }, 'Could not record recommendation signal'));
}

/** Reading time and in-post clicks reported by the browser, merged per post before storing. */
export async function recordClientEvents(userId: string, events: ClientEvent[]): Promise<number> {
  const dwell = new Map<string, number>();
  const clicks = new Map<string, ClientEvent & { type: 'click' }>();
  for (const event of events) {
    if (event.type === 'dwell') dwell.set(event.postId, (dwell.get(event.postId) || 0) + event.ms);
    else clicks.set(`${event.target}:${event.id}`, event);
  }
  let stored = 0;
  for (const [postId, ms] of dwell) if (await recordSignal(userId, { type: 'dwell', targetType: 'post', targetId: postId, durationMs: ms })) stored += 1;
  for (const event of clicks.values()) if (await recordSignal(userId, { type: 'click', targetType: event.target, targetId: event.id })) stored += 1;
  return stored;
}

/** Recent signals, newest first, in the shape the engine expects. */
export async function loadSignals(userId: string): Promise<Signal[]> {
  const rows = await Interaction.find({ userId, createdAt: { $gte: new Date(Date.now() - SIGNAL_WINDOW_DAYS * 86_400_000) } })
    .sort({ createdAt: -1 }).limit(SIGNAL_LOAD_LIMIT).lean();
  return rows.map((row: any) => ({
    type: row.type, targetType: row.targetType, targetId: row.targetId ? String(row.targetId) : null,
    authorId: row.authorId ? String(row.authorId) : null, groupId: row.groupId ? String(row.groupId) : null,
    label: row.label || '', durationMs: row.durationMs || 0, features: row.features || [], createdAt: row.createdAt
  }));
}

export async function clearSignals(userId: string): Promise<number> {
  const result = await Interaction.deleteMany({ userId });
  await invalidateCacheKeys([recommendationCacheKey(userId)]);
  return result.deletedCount || 0;
}
