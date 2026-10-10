import { Block, Follow, Friendship, Notification, SocialPreference, User } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { invalidateSocialCaches } from './cache.service.js';
import { emitUserEvent } from './notification.service.js';

export async function blockedUserIds(userId: string): Promise<string[]> {
  const rows = await Block.find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).select('blockerId blockedId').lean();
  return rows.map((row: any) => String(row.blockerId) === userId ? String(row.blockedId) : String(row.blockerId));
}

export async function isBlocked(firstId: string, secondId: string) {
  return !!(await Block.exists({ $or: [{ blockerId: firstId, blockedId: secondId }, { blockerId: secondId, blockedId: firstId }] }));
}

export async function assertNotBlocked(firstId: string, secondId: string) {
  if (await isBlocked(firstId, secondId)) throw new AppError(403, 'This person is unavailable.', 'USER_BLOCKED');
}

export async function feedExclusions(userId: string) {
  const [blocked, preferences] = await Promise.all([
    blockedUserIds(userId),
    SocialPreference.find({ userId, seeLess: true }).select('targetId').lean()
  ]);
  return [...new Set([...blocked, ...preferences.map((row: any) => String(row.targetId))])];
}

export async function restrictedAuthorIds(viewerId: string): Promise<string[]> {
  const rows = await SocialPreference.find({ targetId: viewerId, restrictPosts: true }).select('userId').lean();
  return rows.map((row: any) => String(row.userId));
}

export async function getSocialState(userId: string, targetId: string) {
  const [block, preference]: any[] = await Promise.all([
    Block.findOne({ $or: [{ blockerId: userId, blockedId: targetId }, { blockerId: targetId, blockedId: userId }] }).lean(),
    SocialPreference.findOne({ userId, targetId }).lean()
  ]);
  return { blocked: !!block, blockedByMe: !!block && String(block.blockerId) === userId, seeLess: !!preference?.seeLess, restrictPosts: !!preference?.restrictPosts };
}

async function assertTarget(actorId: string, targetId: string) {
  if (actorId === targetId) throw new AppError(400, 'Choose another person.', 'INVALID_TARGET');
  if (!(await User.exists({ _id: targetId, deletedAt: null }))) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
}

export async function setBreak(actorId: string, targetId: string, input: { seeLess: boolean; restrictPosts: boolean }) {
  await assertTarget(actorId, targetId);
  await assertNotBlocked(actorId, targetId);
  await SocialPreference.updateOne({ userId: actorId, targetId }, { $set: input }, { upsert: true });
  await invalidateSocialCaches([actorId, targetId]);
  emitUserEvent(actorId, 'social:changed', { userId: targetId, ...input });
  return input;
}

export async function setBlock(actorId: string, targetId: string, blocked: boolean) {
  await assertTarget(actorId, targetId);
  if (blocked) {
    await Block.updateOne({ blockerId: actorId, blockedId: targetId }, { $setOnInsert: { blockerId: actorId, blockedId: targetId } }, { upsert: true });
    const [userAId, userBId] = [actorId, targetId].sort();
    await Promise.all([
      Friendship.deleteOne({ userAId, userBId }),
      Follow.deleteMany({ $or: [{ followerId: actorId, followingId: targetId }, { followerId: targetId, followingId: actorId }] }),
      SocialPreference.deleteMany({ $or: [{ userId: actorId, targetId }, { userId: targetId, targetId: actorId }] }),
      Notification.deleteMany({ $or: [{ actorId, recipientId: targetId }, { actorId: targetId, recipientId: actorId }] })
    ]);
  } else {
    await Block.deleteOne({ blockerId: actorId, blockedId: targetId });
  }
  await invalidateSocialCaches([actorId, targetId]);
  emitUserEvent(actorId, 'social:changed', { userId: targetId, blocked });
  emitUserEvent(targetId, 'social:changed', { userId: actorId, unavailable: true });
  return { blocked };
}
