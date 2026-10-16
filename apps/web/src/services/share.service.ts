import { Conversation, Group, GroupMember, Post } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { invalidateSocialCaches } from './cache.service.js';
import { listFriends } from './friendship.service.js';
import { createConversation, sendMessage } from './message.service.js';
import { notify } from './notification.service.js';
import { assertCanAccessPost, createPost } from './post.service.js';

const AUDIENCE_RANK: Record<string, number> = { private: 0, followers: 1, public: 2 };

/** The post a share points at. Sharing a share shares its original, as on Facebook. */
async function shareablePost(userId: string, postId: string) {
  let post: any = await Post.findOne({ _id: postId, deletedAt: null }).lean();
  if (!post) throw new AppError(404, 'Post not found.', 'POST_NOT_FOUND');
  if (post.sharedPostId) {
    post = await Post.findOne({ _id: post.sharedPostId, deletedAt: null }).lean();
    if (!post) throw new AppError(404, "This content isn't available anymore.", 'POST_NOT_FOUND');
  }
  await assertCanAccessPost(post, userId);
  return post;
}

/**
 * The widest audience a post may be re-shared to (null: it can only be sent as a link).
 * Public posts and posts in public groups go anywhere; the author may also share their own
 * followers-only or private post, but never wider than its original audience.
 */
async function shareLimit(post: any, userId: string): Promise<string | null> {
  if (post.groupId) {
    const group: any = await Group.findById(post.groupId).select('privacy').lean();
    return group?.privacy === 'public' ? 'public' : null;
  }
  if (post.visibility === 'public') return 'public';
  return String(post.authorId) === userId ? post.visibility : null;
}

/** "Share now": creates a post on the sharer's feed (or in one of their groups) that embeds the original. */
export async function sharePost(userId: string, postId: string, input: { content: string; visibility: string; groupId?: string }) {
  const original = await shareablePost(userId, postId);
  const limit = await shareLimit(original, userId);
  if (!limit) throw new AppError(403, 'Only public posts can be shared to a feed or group. You can still send it to friends who can see it.', 'SHARE_RESTRICTED');
  if (input.groupId ? limit !== 'public' : AUDIENCE_RANK[input.visibility]! > AUDIENCE_RANK[limit]!) {
    throw new AppError(422, "You can't share this post with a wider audience than the original.", 'SHARE_AUDIENCE');
  }
  const post = await createPost(userId, { ...input, sharedPostId: original._id });
  await Post.updateOne({ _id: original._id }, { $inc: { shareCount: 1 } });
  await notify({ recipientId: String(original.authorId), actorId: userId, type: 'share', entityType: 'Post', entityId: String(post._id), text: 'shared your post' });
  await invalidateSocialCaches([userId, String(original.authorId)]);
  return { post, pending: post.groupStatus === 'pending' };
}

/** "Send in Messenger": posts the link (and an optional note) into a chat with each chosen friend. */
export async function sendPostToFriends(userId: string, postId: string, userIds: string[], content: string, link: string) {
  const post = await shareablePost(userId, postId);
  const text = [content, `${link}/posts/${post._id}`].filter(Boolean).join('\n');
  const sent = [];
  for (const memberId of [...new Set(userIds)]) {
    const conversation = await createConversation(userId, memberId);
    sent.push(await sendMessage(userId, String(conversation._id), text));
  }
  return sent;
}

/** Friends (recent chats first) and groups the user can post in, for the share dialog. */
export async function shareTargets(userId: string) {
  const [friends, recent, memberships] = await Promise.all([
    listFriends(userId, 200),
    Conversation.find({ memberIds: userId }).sort({ lastMessageAt: -1 }).limit(30).select('memberIds').lean(),
    GroupMember.find({ userId }).sort({ createdAt: -1 }).limit(100).populate('groupId', 'name slug coverUrl privacy settings').lean()
  ]);
  const order = new Map<string, number>();
  for (const conversation of recent as any[]) {
    for (const memberId of conversation.memberIds.map(String)) if (memberId !== userId && !order.has(memberId)) order.set(memberId, order.size);
  }
  const rank = (person: any) => order.get(String(person._id)) ?? Number.MAX_SAFE_INTEGER;
  const people = (friends as any[]).map((person, index) => ({ person, index }))
    .sort((a, b) => rank(a.person) - rank(b.person) || a.index - b.index)
    .map(({ person }) => ({ _id: person._id, username: person.username, displayName: person.displayName, avatarUrl: person.profile?.avatarUrl || '' }));
  const groups = (memberships as any[]).filter((row) => row.groupId).map((row) => {
    const group = row.groupId;
    const manager = ['admin', 'moderator'].includes(row.role);
    return { _id: group._id, name: group.name, slug: group.slug, coverUrl: group.coverUrl || '', privacy: group.privacy, canPost: group.settings?.whoCanPost !== 'admins' || manager, needsApproval: !!group.settings?.postApproval && !manager };
  });
  return { friends: people, groups };
}
