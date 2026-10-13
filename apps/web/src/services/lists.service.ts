import mongoose from 'mongoose';
import { Group, GroupInvite, GroupMember, Notification, Post } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { afterCursor, cursorSort, offsetChunk, parseOffsetCursor, timeChunk, type Chunk } from '../utils/paginate.js';
import { getFriendshipStates } from './friendship.service.js';
import { withReactionSummary } from './post.service.js';
import { blockedUserIds, restrictedAuthorIds } from './social.service.js';
import { getProfile } from './user.service.js';

/**
 * Chunk loaders for endless lists that have no natural home in another service.
 * Each one re-checks access, because chunks are fetched independently of the page that showed the first one.
 */

const PERSON_FIELDS = 'username displayName profile.avatarUrl';
export const POST_PAGE_SIZE = 10;
export const MEMBER_PAGE_SIZE = 20;
export const NOTIFICATION_PAGE_SIZE = 20;
export const MEDIA_POSTS_PER_CHUNK = 12;

const isObjectId = (value: unknown) => mongoose.isValidObjectId(String(value ?? ''));

/* ---------- Groups ---------- */

/** Who may read a group's posts and member list: public groups for everyone, private ones for members. */
async function readableGroup(groupId: unknown, viewerId?: string) {
  if (!isObjectId(groupId)) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  const group: any = await Group.findById(groupId).select('privacy visibility').lean();
  if (!group) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  const member = viewerId ? await GroupMember.exists({ groupId, userId: viewerId }) : null;
  if (group.visibility === 'hidden' && !member && !(viewerId && await GroupInvite.exists({ groupId, userId: viewerId }))) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  if (group.privacy === 'private' && !member) throw new AppError(403, 'Join this group to see its posts.', 'GROUP_PRIVATE');
  return group;
}

export async function groupPosts(groupId: unknown, viewerId: string | undefined, cursor: unknown): Promise<Chunk<any>> {
  await readableGroup(groupId, viewerId);
  const rows = await Post.find({ groupId, deletedAt: null, groupStatus: { $nin: ['pending', 'declined'] }, ...afterCursor(cursor) })
    .sort(cursorSort()).limit(POST_PAGE_SIZE + 1).populate('authorId', PERSON_FIELDS).lean();
  const chunk = timeChunk(rows as any[], POST_PAGE_SIZE);
  return { items: await withReactionSummary(chunk.items, viewerId), next: chunk.next };
}

/** Regular members, newest first (admins and moderators are listed separately). */
export async function groupMembers(groupId: unknown, viewerId: string | undefined, cursor: unknown): Promise<Chunk<any>> {
  await readableGroup(groupId, viewerId);
  const rows = await GroupMember.find({ groupId, role: 'member', ...afterCursor(cursor) }).sort(cursorSort()).limit(MEMBER_PAGE_SIZE + 1).populate('userId', PERSON_FIELDS).lean();
  const chunk = timeChunk(rows as any[], MEMBER_PAGE_SIZE);
  return { items: chunk.items.filter((row) => row.userId).map((row) => ({ ...row.userId, role: row.role, joinedAt: row.createdAt })), next: chunk.next };
}

/* ---------- Profiles ---------- */

/** Which of a person's posts the viewer may see. Throws for blocked or missing profiles. */
async function profileAccess(username: string, viewerId?: string) {
  const profile: any = await getProfile(username, viewerId);
  if (profile.blockedByMe) return { profile, filter: null };
  const restricted = viewerId ? (await restrictedAuthorIds(viewerId)).includes(String(profile._id)) : false;
  const visibility = profile.isSelf ? {} : profile.isFollowing && !restricted ? { visibility: { $in: ['public', 'followers'] } } : { visibility: 'public' };
  return { profile, filter: { authorId: profile._id, groupId: null, deletedAt: null, ...visibility } };
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function profilePosts(username: string, viewerId: string | undefined, query: string, cursor: unknown): Promise<Chunk<any>> {
  const { filter } = await profileAccess(username, viewerId);
  if (!filter) return { items: [], next: null };
  const search = query ? { content: { $regex: escapeRegex(query.slice(0, 80)), $options: 'i' } } : {};
  const rows = await Post.find({ ...filter, ...search, ...afterCursor(cursor) }).sort(cursorSort()).limit(POST_PAGE_SIZE + 1).populate('authorId', PERSON_FIELDS).lean();
  const chunk = timeChunk(rows as any[], POST_PAGE_SIZE);
  return { items: await withReactionSummary(chunk.items, viewerId), next: chunk.next };
}

export const MEDIA_TYPES = ['all', 'photos', 'videos'];
export const MEDIA_SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: -1 }, oldest: { createdAt: 1, _id: 1 }, reactions: { reactionCount: -1, createdAt: -1, _id: -1 }, comments: { commentCount: -1, createdAt: -1, _id: -1 }
};
const MIME_BY_TYPE: Record<string, RegExp> = { photos: /^image\//, videos: /^video\// };

/** One tile per photo/video across posts; videos that failed to transcode are only shown to their owner. */
export const flattenMedia = (posts: any[], isOwner: boolean, type = 'all') => posts.flatMap((post) => (post.media || [])
  .map((media: any) => ({ ...media, postId: post._id, mediaId: media._id, createdAt: post.createdAt, isVideo: String(media.mimeType).startsWith('video/') }))
  .filter((media: any) => (media.isVideo || String(media.mimeType).startsWith('image/')) && (isOwner || media.status !== 'failed'))
  .filter((media: any) => type === 'all' || media.isVideo === (type === 'videos')));

/** Media tab tiles. Sorted by reactions/comments too, so it pages by offset over posts. */
export async function profileMedia(username: string, viewerId: string | undefined, type: string, sort: string, cursor: unknown): Promise<Chunk<any> & { isSelf: boolean }> {
  const { profile, filter } = await profileAccess(username, viewerId);
  if (!filter) return { items: [], next: null, isSelf: false };
  const offset = parseOffsetCursor(cursor);
  const mime = MIME_BY_TYPE[type];
  const rows = await Post.find({ ...filter, 'media.0': { $exists: true }, ...(mime ? { 'media.mimeType': mime } : {}) })
    .sort(MEDIA_SORTS[sort] || MEDIA_SORTS.newest!).skip(offset).limit(MEDIA_POSTS_PER_CHUNK + 1).select('media createdAt reactionCount commentCount').lean();
  const chunk = offsetChunk(rows, MEDIA_POSTS_PER_CHUNK, offset);
  return { items: flattenMedia(chunk.items, profile.isSelf, type), next: chunk.next, isSelf: !!profile.isSelf };
}

/** Photo and video totals for the media tab chips, counted in the database instead of from loaded tiles. */
export async function profileMediaCounts(username: string, viewerId?: string) {
  const { profile, filter } = await profileAccess(username, viewerId);
  if (!filter) return { all: 0, photos: 0, videos: 0 };
  const rows = await Post.aggregate([
    { $match: { ...filter, 'media.0': { $exists: true } } },
    { $unwind: '$media' },
    { $match: { 'media.mimeType': /^(image|video)\//, ...(profile.isSelf ? {} : { 'media.status': { $ne: 'failed' } }) } },
    { $group: { _id: { $cond: [{ $regexMatch: { input: '$media.mimeType', regex: /^video\// } }, 'videos', 'photos'] }, count: { $sum: 1 } } }
  ]);
  const count = (key: string) => rows.find((row: any) => row._id === key)?.count || 0;
  return { all: count('photos') + count('videos'), photos: count('photos'), videos: count('videos') };
}

/* ---------- Notifications ---------- */

/**
 * Opening the notifications page marks everything read at `openedAt`. The "Unread" filter and the
 * "new" highlight keep treating those as unread for that visit, so later chunks stay consistent.
 */
export async function notificationChunk(userId: string, unreadOnly: boolean, openedAt: Date, cursor: unknown): Promise<Chunk<any>> {
  const blocked = await blockedUserIds(userId);
  // Both conditions use $or, so they are combined with $and instead of spread into one object.
  const unread = unreadOnly ? [{ $or: [{ readAt: null }, { readAt: { $gte: openedAt } }] }] : [];
  const rows = await Notification.find({ recipientId: userId, actorId: { $nin: blocked }, $and: [...unread, afterCursor(cursor)] })
    .sort(cursorSort()).limit(NOTIFICATION_PAGE_SIZE + 1).populate('actorId', PERSON_FIELDS).lean();
  const chunk = timeChunk(rows as any[], NOTIFICATION_PAGE_SIZE);
  const valid = chunk.items.filter((item) => item.actorId);
  const states = await getFriendshipStates(userId, valid.map((item) => String(item.actorId._id)));
  return { items: valid.map((item) => ({ ...item, friendState: states.get(String(item.actorId._id)) || 'none' })), next: chunk.next };
}
