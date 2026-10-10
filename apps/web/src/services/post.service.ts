import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import { Comment, Follow, Group, GroupMember, GroupPost, Post, Reaction } from '../models/index.js';
import { enqueuePostVideos } from '../media/queue.js';
import { AppError } from '../utils/errors.js';
import { invalidateSocialCaches } from './cache.service.js';
import { notify } from './notification.service.js';
import { assertOwner } from './permissions.js';
import { assertNotBlocked, blockedUserIds, restrictedAuthorIds } from './social.service.js';

const uploadedMedia = (file: Express.Multer.File) => ({ url: `/uploads/${file.filename}`, mimeType: file.mimetype, alt: '', status: file.mimetype.startsWith('video/') ? 'processing' : 'ready', poster: '' });
const clean = (value: string) => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();

async function assertCanAccessPost(post: any, viewerId: string): Promise<void> {
  const authorId = String(post.authorId?._id || post.authorId);
  if (authorId === viewerId) return;
  await assertNotBlocked(authorId, viewerId);
  if (post.groupId) {
    const [member, group]: any[] = await Promise.all([GroupMember.findOne({ groupId: post.groupId, userId: viewerId }).select('role').lean(), Group.findById(post.groupId).select('privacy').lean()]);
    if (post.groupStatus && post.groupStatus !== 'approved') {
      if (['admin', 'moderator'].includes(member?.role)) return;
      throw new AppError(403, 'This post is waiting for admin approval.', 'POST_PENDING');
    }
    if (member || group?.privacy === 'public') return;
    throw new AppError(403, 'This group post is not available to you.', 'POST_FORBIDDEN');
  }
  if (post.visibility === 'public') return;
  if (post.visibility === 'followers' && !(await restrictedAuthorIds(viewerId)).includes(authorId) && await Follow.exists({ followerId: viewerId, followingId: authorId })) return;
  throw new AppError(403, 'This post is not available to you.', 'POST_FORBIDDEN');
}

export async function createPost(authorId: string, input: any, files: Express.Multer.File[] = []) {
  let groupStatus = 'approved';
  let groupInfo: any = null;
  if (input.groupId) {
    const [member, group]: any[] = await Promise.all([GroupMember.findOne({ groupId: input.groupId, userId: authorId }).select('role').lean(), Group.findById(input.groupId).select('name ownerId settings').lean()]);
    if (!member || !group) throw new AppError(403, 'Join this group before posting.', 'GROUP_MEMBERSHIP_REQUIRED');
    const manager = ['admin', 'moderator'].includes(member.role);
    if (group.settings?.whoCanPost === 'admins' && !manager) throw new AppError(403, 'Only admins can post in this group.', 'GROUP_POSTING_RESTRICTED');
    if (group.settings?.postApproval && !manager) groupStatus = 'pending';
    groupInfo = group;
  }
  const media = files.map(uploadedMedia);
  const content = clean(input.content || '');
  if (!content && media.length === 0 && !input.feeling && !input.place) throw new AppError(422, 'Write something, add a photo or video, or check in somewhere.', 'EMPTY_POST');
  const post = await Post.create({ authorId, groupId: input.groupId || null, content, visibility: input.visibility, media, groupStatus, feeling: input.feeling || null, place: input.place || null });
  await enqueuePostVideos(post, media.map((item) => item.url));
  if (input.groupId) await GroupPost.create({ groupId: input.groupId, postId: post.id, authorId });
  if (groupStatus === 'pending') await notify({ recipientId: String(groupInfo.ownerId), actorId: authorId, type: 'group_post', entityType: 'Group', entityId: input.groupId, text: `posted in ${groupInfo.name} and is waiting for approval` });
  await invalidateSocialCaches([authorId]);
  return post;
}

const isEmptyPost = (post: any) => !post.content && !post.media.length && !post.feeling && !post.place;

async function ownedPost(userId: string, postId: string) {
  const post = await Post.findOne({ _id: postId, deletedAt: null });
  if (!post) throw new AppError(404, 'Post not found.', 'POST_NOT_FOUND');
  assertOwner(post.authorId, userId, 'You can only change your own posts.');
  return post;
}

/** Edits text and, when a layout is sent, rebuilds the photo/video list from kept ids and new uploads (in display order). */
export async function updatePost(userId: string, postId: string, input: { content: string; visibility?: string; layout: Array<{ id: string } | { upload: number }> | null; feeling?: unknown; place?: unknown }, files: Express.Multer.File[] = []) {
  const post = await ownedPost(userId, postId);
  await assertCanAccessPost(post, userId);
  if (input.layout) {
    const existing = new Map(post.media.map((media: any) => [String(media._id), media]));
    post.media = input.layout.map((slot) => {
      if ('id' in slot) {
        const media = existing.get(slot.id);
        if (!media) throw new AppError(422, 'One of the photos or videos no longer exists. Reload and try again.', 'MEDIA_NOT_FOUND');
        return media;
      }
      const file = files[slot.upload];
      if (!file) throw new AppError(422, 'A new photo or video is missing from the upload.', 'MEDIA_UPLOAD_MISSING');
      return uploadedMedia(file);
    }) as any;
  }
  post.content = clean(input.content || '');
  // Group posts follow the group's privacy; their own audience never changes.
  if (input.visibility && !post.groupId) post.visibility = input.visibility;
  if (input.feeling !== undefined) post.feeling = input.feeling as any;
  if (input.place !== undefined) post.place = input.place as any;
  if (isEmptyPost(post)) throw new AppError(422, 'A post needs text, a photo or video, or a check-in.', 'EMPTY_POST');
  post.editedAt = new Date(); await post.save();
  await enqueuePostVideos(post, files.map((file) => `/uploads/${file.filename}`));
  await invalidateSocialCaches([userId]);
  return post;
}

export async function replacePostMedia(userId: string, postId: string, mediaId: string, file?: Express.Multer.File) {
  if (!file) throw new AppError(422, 'Choose a photo or video to upload.', 'MEDIA_UPLOAD_MISSING');
  const post = await ownedPost(userId, postId);
  const media = post.media.id(mediaId);
  if (!media) throw new AppError(404, 'Media not found.', 'MEDIA_NOT_FOUND');
  Object.assign(media, uploadedMedia(file));
  post.editedAt = new Date(); await post.save();
  await enqueuePostVideos(post, [media.url]);
  await invalidateSocialCaches([userId]);
  return { media };
}

/** Removes one photo; a post left with nothing in it is moved to trash, as Facebook does. */
export async function removePostMedia(userId: string, postId: string, mediaId: string) {
  const post = await ownedPost(userId, postId);
  if (!post.media.id(mediaId)) throw new AppError(404, 'Media not found.', 'MEDIA_NOT_FOUND');
  post.media.pull({ _id: mediaId });
  if (isEmptyPost(post)) post.deletedAt = new Date(); else post.editedAt = new Date();
  await post.save();
  await invalidateSocialCaches([userId]);
  return { postDeleted: !!post.deletedAt };
}

export async function deletePost(userId: string, postId: string) {
  const post = await Post.findOne({ _id: postId, deletedAt: null });
  if (!post) throw new AppError(404, 'Post not found.', 'POST_NOT_FOUND');
  await assertCanAccessPost(post, userId);
  assertOwner(post.authorId, userId, 'You can only delete your own posts.');
  post.deletedAt = new Date(); await post.save(); await invalidateSocialCaches([userId]);
}

export async function react(userId: string, postId: string, type: string) {
  const post = await Post.findOne({ _id: postId, deletedAt: null });
  if (!post) throw new AppError(404, 'Post not found.', 'POST_NOT_FOUND');
  await assertCanAccessPost(post, userId);
  const existing = await Reaction.findOne({ userId, postId });
  let active: string | null = type;
  if (existing?.type === type) { await existing.deleteOne(); active = null; }
  else if (existing) { existing.type = type; await existing.save(); }
  else await Reaction.create({ userId, postId, type });
  post.reactionCount = await Reaction.countDocuments({ postId }); await post.save();
  if (active) await notify({ recipientId: String(post.authorId), actorId: userId, type: 'reaction', entityType: 'Post', entityId: postId, text: `reacted ${type} to your post` });
  await invalidateSocialCaches([userId, String(post.authorId)]);
  return { active, count: post.reactionCount };
}

export async function addComment(userId: string, postId: string, input: any) {
  const post = await Post.findOne({ _id: postId, deletedAt: null });
  if (!post) throw new AppError(404, 'Post not found.', 'POST_NOT_FOUND');
  await assertCanAccessPost(post, userId);
  if (input.parentId && !(await Comment.exists({ _id: input.parentId, postId, deletedAt: null }))) throw new AppError(400, 'Parent comment is invalid.', 'INVALID_PARENT');
  const comment = await Comment.create({ postId, authorId: userId, parentId: input.parentId || null, content: clean(input.content) });
  post.commentCount = await Comment.countDocuments({ postId, deletedAt: null }); await post.save();
  await notify({ recipientId: String(post.authorId), actorId: userId, type: 'comment', entityType: 'Post', entityId: postId, text: input.parentId ? 'replied on your post' : 'commented on your post' });
  await invalidateSocialCaches([userId, String(post.authorId)]);
  return comment;
}

/** Post author and group admins/moderators may remove anyone's comment on the post. */
async function canModeratePost(post: any, userId?: string) {
  if (!userId) return false;
  if (String(post.authorId?._id || post.authorId) === userId) return true;
  if (!post.groupId) return false;
  const member: any = await GroupMember.findOne({ groupId: post.groupId?._id || post.groupId, userId }).select('role').lean();
  return ['admin', 'moderator'].includes(member?.role);
}

async function loadComment(commentId: string) {
  if (!mongoose.isValidObjectId(commentId)) throw new AppError(404, 'Comment not found.', 'COMMENT_NOT_FOUND');
  const comment = await Comment.findOne({ _id: commentId, deletedAt: null });
  const post = comment && await Post.findOne({ _id: comment.postId, deletedAt: null });
  if (!comment || !post) throw new AppError(404, 'Comment not found.', 'COMMENT_NOT_FOUND');
  return { comment, post };
}

/** Only the author can change the text of a comment. */
export async function editComment(userId: string, commentId: string, content: string) {
  const { comment, post } = await loadComment(commentId);
  assertOwner(comment.authorId, userId, 'You can only edit your own comments.');
  await assertCanAccessPost(post, userId);
  comment.content = clean(content);
  if (!comment.content) throw new AppError(422, 'Write something before saving.', 'EMPTY_COMMENT');
  comment.editedAt = new Date(); await comment.save();
  await invalidateSocialCaches([userId, String(post.authorId)]);
  return comment;
}

/** Soft-deletes a comment and, for a top-level comment, its replies (as Facebook does). */
export async function deleteComment(userId: string, commentId: string) {
  const { comment, post } = await loadComment(commentId);
  const isAuthor = String(comment.authorId) === userId;
  if (!isAuthor && !(await canModeratePost(post, userId))) throw new AppError(403, 'You can only delete your own comments or comments on your posts.', 'NOT_OWNER');
  const now = new Date();
  const ids = [comment._id, ...(comment.parentId ? [] : (await Comment.find({ parentId: comment._id, deletedAt: null }).select('_id').lean()).map((reply: any) => reply._id))];
  await Comment.updateMany({ _id: { $in: ids } }, { $set: { deletedAt: now } });
  post.commentCount = await Comment.countDocuments({ postId: post._id, deletedAt: null }); await post.save();
  await invalidateSocialCaches([userId, String(post.authorId)]);
  return { removed: ids.map(String), commentCount: post.commentCount, byModerator: !isAuthor, postId: String(post._id) };
}

export async function getPostDetail(postId: string, viewerId?: string) {
  const post = await Post.findOne({ _id: postId, deletedAt: null }).populate('authorId', 'username displayName profile.avatarUrl').lean();
  if (!post) throw new AppError(404, 'Post not found.', 'POST_NOT_FOUND');
  if (!viewerId) {
    const group = (post as any).groupId ? await Group.findById((post as any).groupId).select('privacy').lean() : null;
    if ((post as any).visibility !== 'public' || (group as any)?.privacy === 'private') throw new AppError(401, 'Please sign in to view this post.', 'AUTH_REQUIRED');
  } else await assertCanAccessPost(post, viewerId);
  const blocked = viewerId ? await blockedUserIds(viewerId) : [];
  const comments = await Comment.find({ postId, deletedAt: null, authorId: { $nin: blocked } }).sort({ createdAt: 1 }).populate('authorId', 'username displayName profile.avatarUrl').lean();
  return { post, comments, canModerate: await canModeratePost(post, viewerId) };
}


/** Adds the viewer's reaction and the three most-used reaction types to each post (for the Facebook-style stats row). */
export async function withReactionSummary<T extends { _id: unknown; myReaction?: string | null }>(posts: T[], viewerId?: string): Promise<Array<T & { topReactions: string[]; myReaction: string | null }>> {
  if (viewerId) {
    const blocked = new Set(await blockedUserIds(viewerId));
    posts = posts.filter((post: any) => !blocked.has(String(post.authorId?._id || post.authorId)));
  }
  if (!posts.length) return [];
  const ids = posts.map((post) => new mongoose.Types.ObjectId(String(post._id)));
  const [counts, mine] = await Promise.all([
    Reaction.aggregate([{ $match: { postId: { $in: ids } } }, { $group: { _id: { postId: '$postId', type: '$type' }, count: { $sum: 1 } } }]),
    viewerId ? Reaction.find({ userId: viewerId, postId: { $in: ids } }).select('postId type').lean() : Promise.resolve([])
  ]);
  const byPost = new Map<string, Array<{ type: string; count: number }>>();
  for (const row of counts as any[]) {
    const key = String(row._id.postId);
    byPost.set(key, [...(byPost.get(key) || []), { type: row._id.type, count: row.count }]);
  }
  const mineByPost = new Map((mine as any[]).map((item) => [String(item.postId), item.type as string]));
  return posts.map((post) => {
    const key = String(post._id);
    const topReactions = (byPost.get(key) || []).sort((a, b) => b.count - a.count).slice(0, 3).map((item) => item.type);
    return { ...post, topReactions, myReaction: mineByPost.get(key) ?? null };
  });
}
