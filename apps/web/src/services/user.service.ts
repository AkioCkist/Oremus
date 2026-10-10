import { Follow, User } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { cacheGet, cacheSet, invalidateSocialCaches } from './cache.service.js';
import { notify } from './notification.service.js';

export async function getProfile(username: string, viewerId?: string) {
  const user = await User.findOne({ username, deletedAt: null });
  if (!user) throw new AppError(404, 'Profile not found.', 'PROFILE_NOT_FOUND');
  const key = `profile:${user.id}`;
  let summary = await cacheGet<any>(key);
  if (!summary) {
    const [followers, following] = await Promise.all([Follow.countDocuments({ followingId: user.id }), Follow.countDocuments({ followerId: user.id })]);
    summary = { ...user.toObject(), followers, following };
    await cacheSet(key, summary, 120);
  }
  const isFollowing = viewerId ? !!(await Follow.exists({ followerId: viewerId, followingId: user.id })) : false;
  const isSelf = viewerId === user.id;
  const canViewDetails = summary.profile?.privacy === 'public' || isSelf || isFollowing;
  if (!canViewDetails) summary = { ...summary, profile: { ...summary.profile, bio: '', location: '', website: '', coverUrl: '' } };
  return { ...summary, isFollowing, isSelf, canViewDetails };
}

export async function updateProfile(userId: string, input: any, files: { [fieldname: string]: Express.Multer.File[] } = {}) {
  const duplicate = await User.exists({ username: input.username, _id: { $ne: userId } });
  if (duplicate) throw new AppError(409, 'That username is already in use.', 'USERNAME_TAKEN');
  const avatar = files.avatar?.[0], cover = files.cover?.[0];
  const update: any = { displayName: input.displayName, username: input.username, 'profile.bio': input.bio, 'profile.location': input.location, 'profile.website': input.website, 'profile.privacy': input.privacy };
  if (avatar) update['profile.avatarUrl'] = `/uploads/${avatar.filename}`;
  if (cover) update['profile.coverUrl'] = `/uploads/${cover.filename}`;
  const user = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true });
  await invalidateSocialCaches([userId]);
  return user;
}

export async function toggleFollow(actorId: string, targetId: string) {
  if (actorId === targetId) throw new AppError(400, 'You cannot follow yourself.', 'INVALID_FOLLOW');
  const target = await User.findOne({ _id: targetId, deletedAt: null });
  if (!target) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
  const existing = await Follow.findOne({ followerId: actorId, followingId: targetId });
  if (existing) { await existing.deleteOne(); await invalidateSocialCaches([actorId, targetId]); return { following: false }; }
  await Follow.create({ followerId: actorId, followingId: targetId });
  await notify({ recipientId: targetId, actorId, type: 'follow', entityType: 'User', entityId: actorId, text: 'started following you' });
  await invalidateSocialCaches([actorId, targetId]);
  return { following: true };
}

