import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import { Comment, Follow, Group, GroupMember, GroupPost, Post, Reaction } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { invalidateSocialCaches } from './cache.service.js';
import { notify } from './notification.service.js';
import { assertOwner } from './permissions.js';

const clean = (value: string) => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();

async function assertCanAccessPost(post: any, viewerId: string): Promise<void> {
  const authorId = String(post.authorId?._id || post.authorId);
  if (authorId === viewerId) return;
  if (post.groupId) {
    const [member, group] = await Promise.all([GroupMember.exists({ groupId: post.groupId, userId: viewerId }), Group.findById(post.groupId).select('privacy').lean()]);
    if (member || (group as any)?.privacy === 'public') return;
    throw new AppError(403, 'This group post is not available to you.', 'POST_FORBIDDEN');
  }
  if (post.visibility === 'public') return;
  if (post.visibility === 'followers' && await Follow.exists({ followerId: viewerId, followingId: authorId })) return;
  throw new AppError(403, 'This post is not available to you.', 'POST_FORBIDDEN');
}

export async function createPost(authorId: string, input: any, files: Express.Multer.File[] = []) {
  if (input.groupId && !(await GroupMember.exists({ groupId: input.groupId, userId: authorId }))) throw new AppError(403, 'Join this group before posting.', 'GROUP_MEMBERSHIP_REQUIRED');
  const media = files.map((file) => ({ url: `/uploads/${file.filename}`, mimeType: file.mimetype, alt: '' }));
  const content = clean(input.content || '');
  if (!content && media.length === 0) throw new AppError(422, 'Write something or add an image.', 'EMPTY_POST');
  const post = await Post.create({ authorId, groupId: input.groupId || null, content, visibility: input.visibility, media });
  if (input.groupId) await GroupPost.create({ groupId: input.groupId, postId: post.id, authorId });
  await invalidateSocialCaches([authorId]);
  return post;
}

export async function updatePost(userId: string, postId: string, input: any) {
  const post = await Post.findOne({ _id: postId, deletedAt: null });
  if (!post) throw new AppError(404, 'Post not found.', 'POST_NOT_FOUND');
  await assertCanAccessPost(post, userId);
  assertOwner(post.authorId, userId, 'You can only edit your own posts.');
  post.content = clean(input.content); if (input.visibility) post.visibility = input.visibility; post.editedAt = new Date(); await post.save();
  await invalidateSocialCaches([userId]);
  return post;
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

export async function getPostDetail(postId: string, viewerId?: string) {
  const post = await Post.findOne({ _id: postId, deletedAt: null }).populate('authorId', 'username displayName profile.avatarUrl').lean();
  if (!post) throw new AppError(404, 'Post not found.', 'POST_NOT_FOUND');
  if (!viewerId) {
    const group = (post as any).groupId ? await Group.findById((post as any).groupId).select('privacy').lean() : null;
    if ((post as any).visibility !== 'public' || (group as any)?.privacy === 'private') throw new AppError(401, 'Please sign in to view this post.', 'AUTH_REQUIRED');
  } else await assertCanAccessPost(post, viewerId);
  const comments = await Comment.find({ postId, deletedAt: null }).sort({ createdAt: 1 }).populate('authorId', 'username displayName profile.avatarUrl').lean();
  return { post, comments };
}


/** Adds the viewer's reaction and the three most-used reaction types to each post (for the Facebook-style stats row). */
export async function withReactionSummary<T extends { _id: unknown; myReaction?: string | null }>(posts: T[], viewerId?: string): Promise<Array<T & { topReactions: string[]; myReaction: string | null }>> {
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
