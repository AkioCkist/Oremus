import sanitizeHtml from 'sanitize-html';
import { Follow, Story, StoryView, User, STORY_TTL_MS } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { createConversation, sendMessage } from './message.service.js';
import { notify } from './notification.service.js';
import { assertOwner } from './permissions.js';
import { assertNotBlocked, blockedUserIds, feedExclusions, restrictedAuthorIds } from './social.service.js';

const clean = (value: string) => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
const AUTHOR_FIELDS = 'username displayName profile.avatarUrl';
const activeFilter = () => ({ deletedAt: null, expiresAt: { $gt: new Date() } });
const idOf = (value: any) => String(value?._id ?? value);

export type TrayStory = { id: string; mediaUrl: string | null; text: string; background: string; createdAt: Date; seen: boolean; myReaction: string | null; viewCount?: number };
export type TrayGroup = { author: { _id: string; username: string; displayName: string; avatarUrl: string }; isSelf: boolean; hasUnseen: boolean; latestAt: Date; startIndex: number; stories: TrayStory[] };

/** Audience rule: authors always see their own stories; others need a public story or to follow the author. */
export function canViewStory(story: { authorId: unknown; audience: string }, viewerId: string, followingIds: Set<string>): boolean {
  const authorId = idOf(story.authorId);
  return authorId === viewerId || story.audience === 'public' || followingIds.has(authorId);
}

/** Groups active stories (oldest first) by author and orders the tray: you, then unseen, then most recent. */
export function buildStoryTray(stories: any[], views: any[], viewerId: string): TrayGroup[] {
  const viewByStory = new Map(views.map((view) => [String(view.storyId), view]));
  const groups = new Map<string, TrayGroup>();
  for (const story of stories) {
    const author = story.authorId;
    const authorId = idOf(author);
    const isSelf = authorId === viewerId;
    let group = groups.get(authorId);
    if (!group) {
      group = { author: { _id: authorId, username: author.username, displayName: author.displayName, avatarUrl: author.profile?.avatarUrl || '' }, isSelf, hasUnseen: false, latestAt: story.createdAt, startIndex: 0, stories: [] };
      groups.set(authorId, group);
    }
    const view = viewByStory.get(String(story._id));
    group.stories.push({ id: String(story._id), mediaUrl: story.media?.url || null, text: story.text || '', background: story.background || 'ocean', createdAt: story.createdAt, seen: isSelf || !!view, myReaction: view?.reaction ?? null, ...(isSelf ? { viewCount: story.viewCount || 0 } : {}) });
    if (story.createdAt > group.latestAt) group.latestAt = story.createdAt;
  }
  const tray = [...groups.values()].map((group) => {
    const firstUnseen = group.stories.findIndex((story) => !story.seen);
    return { ...group, hasUnseen: firstUnseen !== -1, startIndex: Math.max(firstUnseen, 0) };
  });
  return tray.sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || Number(b.hasUnseen) - Number(a.hasUnseen) || new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
}

async function followingSet(userId: string): Promise<Set<string>> {
  const follows = await Follow.find({ followerId: userId }).select('followingId').lean();
  return new Set(follows.map((item: any) => String(item.followingId)));
}

/** Stories from you and people you follow; `extraAuthorIds` adds public stories from anyone else (e.g. a profile you opened). */
export async function getStoryTray(viewerId: string, extraAuthorIds: string[] = []): Promise<TrayGroup[]> {
  const [following, excluded, restricted, blocked] = await Promise.all([followingSet(viewerId), feedExclusions(viewerId), restrictedAuthorIds(viewerId), blockedUserIds(viewerId)]);
  const stories = await Story.find({ ...activeFilter(), authorId: { $nin: blocked }, $or: [
    { authorId: viewerId },
    { authorId: { $in: [...following], $nin: excluded }, $or: [{ audience: 'public' }, { authorId: { $nin: restricted }, audience: 'followers' }] },
    { authorId: { $in: extraAuthorIds }, $or: [{ audience: 'public' }, { authorId: { $in: [...following], $nin: restricted }, audience: 'followers' }] }
  ] })
    .sort({ createdAt: 1 }).limit(400).populate('authorId', AUTHOR_FIELDS).lean();
  const visible = stories.filter((story: any) => story.authorId && canViewStory(story, viewerId, following));
  const views = await StoryView.find({ viewerId, storyId: { $in: visible.map((story: any) => story._id) } }).select('storyId reaction').lean();
  return buildStoryTray(visible, views, viewerId);
}

async function getAccessibleStory(storyId: string, viewerId: string) {
  const story = await Story.findOne({ _id: storyId, ...activeFilter() });
  if (!story) throw new AppError(404, 'This story is no longer available.', 'STORY_NOT_FOUND');
  await assertNotBlocked(String(story.authorId), viewerId);
  if (story.audience === 'followers' && (await restrictedAuthorIds(viewerId)).includes(String(story.authorId))) throw new AppError(403, 'This story is not available to you.', 'STORY_FORBIDDEN');
  const following = String(story.authorId) === viewerId || story.audience === 'public' ? new Set<string>() : await followingSet(viewerId);
  if (!canViewStory(story, viewerId, following)) throw new AppError(403, 'This story is only shared with followers.', 'STORY_FORBIDDEN');
  return story;
}

export async function createStory(authorId: string, input: { text: string; background: string; audience?: string }, file?: Express.Multer.File) {
  const text = clean(input.text || '');
  if (!file && !text) throw new AppError(422, 'Add a photo or write something for your story.', 'EMPTY_STORY');
  const author = await User.findById(authorId).select('profile.storyAudience').lean();
  const audience = input.audience || (author as any)?.profile?.storyAudience || 'followers';
  return Story.create({
    authorId, text, background: input.background, audience,
    media: file ? { url: `/uploads/${file.filename}`, mimeType: file.mimetype } : null,
    expiresAt: new Date(Date.now() + STORY_TTL_MS)
  });
}

export async function markViewed(storyId: string, viewerId: string) {
  const story = await getAccessibleStory(storyId, viewerId);
  if (String(story.authorId) === viewerId) return { viewCount: story.viewCount };
  const result = await StoryView.updateOne({ storyId, viewerId }, { $setOnInsert: { reaction: null } }, { upsert: true });
  if (result.upsertedCount) await Story.updateOne({ _id: storyId }, { $inc: { viewCount: 1 } });
  return { seen: true };
}

export async function reactToStory(storyId: string, userId: string, type: string) {
  const story = await getAccessibleStory(storyId, userId);
  if (String(story.authorId) === userId) throw new AppError(400, 'You cannot react to your own story.', 'INVALID_REACTION');
  const existing = await StoryView.findOne({ storyId, viewerId: userId });
  const active = existing?.reaction === type ? null : type;
  if (existing) { existing.reaction = active; await existing.save(); }
  else { await StoryView.create({ storyId, viewerId: userId, reaction: active }); await Story.updateOne({ _id: storyId }, { $inc: { viewCount: 1 } }); }
  if (active) await notify({ recipientId: String(story.authorId), actorId: userId, type: 'story_reaction', entityType: 'Story', entityId: storyId, text: `reacted ${active} to your story` });
  return { active };
}

export async function replyToStory(storyId: string, userId: string, content: string) {
  const story = await getAccessibleStory(storyId, userId);
  const authorId = String(story.authorId);
  if (authorId === userId) throw new AppError(400, 'You cannot reply to your own story.', 'INVALID_REPLY');
  const conversation = await createConversation(userId, authorId);
  const result = await sendMessage(userId, String(conversation._id), `Replied to your story: ${clean(content)}`);
  return { conversationId: String(conversation._id), ...result };
}

export async function deleteStory(storyId: string, userId: string) {
  const story = await Story.findOne({ _id: storyId, deletedAt: null });
  if (!story) throw new AppError(404, 'Story not found.', 'STORY_NOT_FOUND');
  assertOwner(story.authorId, userId, 'You can only delete your own stories.');
  story.deletedAt = new Date(); await story.save();
}

export async function listViewers(storyId: string, ownerId: string) {
  const story = await Story.findOne({ _id: storyId, deletedAt: null }).select('authorId viewCount').lean();
  if (!story) throw new AppError(404, 'Story not found.', 'STORY_NOT_FOUND');
  assertOwner((story as any).authorId, ownerId, 'Only the author can see who viewed this story.');
  const views = await StoryView.find({ storyId }).sort({ updatedAt: -1 }).limit(200).populate('viewerId', AUTHOR_FIELDS).lean();
  return { viewCount: (story as any).viewCount, viewers: views.filter((view: any) => view.viewerId).map((view: any) => ({ user: view.viewerId, reaction: view.reaction, viewedAt: view.updatedAt })) };
}

export async function listArchive(userId: string) {
  return Story.find({ authorId: userId, deletedAt: null }).sort({ createdAt: -1 }).limit(120).lean();
}

export async function updateStorySettings(userId: string, audience: 'public' | 'followers') {
  await User.updateOne({ _id: userId }, { 'profile.storyAudience': audience });
  return { audience };
}
