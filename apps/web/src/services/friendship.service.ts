import { Conversation, Follow, Friendship, Notification, User } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { invalidateSocialCaches } from './cache.service.js';
import { notify } from './notification.service.js';
import { assertNotBlocked, isBlocked } from './social.service.js';

export type FriendState = 'self' | 'none' | 'outgoing' | 'incoming' | 'friends';
export type FriendAction = 'request' | 'cancel' | 'accept' | 'decline' | 'unfriend';

export function friendshipPair(firstId: string, secondId: string) {
  const [userAId, userBId] = [String(firstId), String(secondId)].sort();
  return { userAId, userBId };
}

export function stateFromFriendship(viewerId: string, otherId: string, friendship?: any): FriendState {
  if (String(viewerId) === String(otherId)) return 'self';
  if (!friendship) return 'none';
  if (friendship.status === 'accepted') return 'friends';
  return String(friendship.requesterId) === String(viewerId) ? 'outgoing' : 'incoming';
}

async function findFriendship(firstId: string, secondId: string) {
  return Friendship.findOne(friendshipPair(firstId, secondId));
}

export async function getFriendshipState(viewerId: string, otherId: string): Promise<FriendState> {
  if (String(viewerId) === String(otherId)) return 'self';
  return stateFromFriendship(viewerId, otherId, await findFriendship(viewerId, otherId));
}

export async function getFriendshipStates(viewerId: string, otherIds: string[]) {
  const ids = [...new Set(otherIds.map(String).filter((id) => id && id !== String(viewerId)))];
  const states = new Map<string, FriendState>(ids.map((id) => [id, 'none']));
  if (!ids.length) return states;
  const rows = await Friendship.find({
    $or: [
      { userAId: viewerId, userBId: { $in: ids } },
      { userBId: viewerId, userAId: { $in: ids } }
    ]
  }).lean();
  for (const row of rows) {
    const otherId = String(row.userAId) === String(viewerId) ? String(row.userBId) : String(row.userAId);
    states.set(otherId, stateFromFriendship(viewerId, otherId, row));
  }
  return states;
}

export async function listFriendIds(userId: string): Promise<string[]> {
  const rows = await Friendship.find({ status: 'accepted', $or: [{ userAId: userId }, { userBId: userId }] })
    .sort({ acceptedAt: -1, updatedAt: -1 }).select('userAId userBId').lean();
  return rows.map((row: any) => String(row.userAId) === String(userId) ? String(row.userBId) : String(row.userAId));
}

export async function listFriends(userId: string, limit = 60) {
  const ids = (await listFriendIds(userId)).slice(0, limit);
  if (!ids.length) return [];
  const users = await User.find({ _id: { $in: ids }, deletedAt: null }).select('username displayName profile.avatarUrl').lean();
  const byId = new Map(users.map((user: any) => [String(user._id), user]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function areFriends(firstId: string, secondId: string): Promise<boolean> {
  if (String(firstId) === String(secondId)) return false;
  if (await isBlocked(firstId, secondId)) return false;
  return !!(await Friendship.exists({ ...friendshipPair(firstId, secondId), status: 'accepted' }));
}

async function ensureConversation(firstId: string, secondId: string, bumpedAt = new Date()) {
  const existing = await Conversation.findOneAndUpdate(
    { memberIds: { $all: [firstId, secondId], $size: 2 } },
    { $set: { lastMessageAt: bumpedAt } },
    { new: true }
  );
  return existing || Conversation.create({ memberIds: [firstId, secondId], lastMessageAt: bumpedAt });
}

async function removeRequestNotification(friendshipId: unknown) {
  await Notification.deleteMany({ entityType: 'Friendship', entityId: friendshipId, type: 'friend_request' });
}

export async function changeFriendship(actorId: string, targetId: string, action: FriendAction) {
  if (String(actorId) === String(targetId)) throw new AppError(400, 'You cannot add yourself as a friend.', 'INVALID_FRIENDSHIP');
  if (!(await User.exists({ _id: targetId, deletedAt: null }))) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
  await assertNotBlocked(actorId, targetId);
  const pair = friendshipPair(actorId, targetId);

  if (action === 'request') {
    const existing = await Friendship.findOne(pair);
    if (existing) return { state: stateFromFriendship(actorId, targetId, existing) };
    try {
      const friendship = await Friendship.create({ ...pair, requesterId: actorId, status: 'pending' });
      await notify({ recipientId: targetId, actorId, type: 'friend_request', entityType: 'Friendship', entityId: friendship.id, text: 'sent you a friend request' });
      return { state: 'outgoing' as const };
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      return { state: await getFriendshipState(actorId, targetId) };
    }
  }

  if (action === 'cancel') {
    const friendship = await Friendship.findOneAndDelete({ ...pair, status: 'pending', requesterId: actorId });
    if (friendship) await removeRequestNotification(friendship._id);
    return { state: await getFriendshipState(actorId, targetId) };
  }

  if (action === 'decline') {
    const friendship = await Friendship.findOneAndDelete({ ...pair, status: 'pending', requesterId: targetId });
    if (friendship) await removeRequestNotification(friendship._id);
    return { state: await getFriendshipState(actorId, targetId) };
  }

  if (action === 'accept') {
    const acceptedAt = new Date();
    const friendship = await Friendship.findOneAndUpdate(
      { ...pair, status: 'pending', requesterId: targetId },
      { $set: { status: 'accepted', acceptedAt } },
      { new: true }
    );
    if (!friendship) {
      const state = await getFriendshipState(actorId, targetId);
      if (state !== 'friends') return { state };
    }
    const conversation = await ensureConversation(actorId, targetId, friendship?.acceptedAt || acceptedAt);
    await Promise.all([
      Follow.updateOne({ followerId: actorId, followingId: targetId }, {}, { upsert: true }),
      Follow.updateOne({ followerId: targetId, followingId: actorId }, {}, { upsert: true })
    ]);
    await invalidateSocialCaches([actorId, targetId]);
    if (friendship) {
      await removeRequestNotification(friendship._id);
      await notify({ recipientId: targetId, actorId, type: 'friend_accept', entityType: 'Friendship', entityId: friendship.id, text: 'accepted your friend request' });
    }
    return { state: 'friends' as const, conversationId: String(conversation._id) };
  }

  const friendship = await Friendship.findOneAndDelete({ ...pair, status: 'accepted' });
  if (friendship) {
    await Follow.deleteMany({ $or: [{ followerId: actorId, followingId: targetId }, { followerId: targetId, followingId: actorId }] });
    await invalidateSocialCaches([actorId, targetId]);
  }
  return { state: await getFriendshipState(actorId, targetId) };
}
