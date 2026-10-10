import { Follow, Post, User } from '../models/index.js';
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


const HISTORY_LIMIT = 12;
const unique = (values: Array<string | undefined | null>) => [...new Set(values.filter((value): value is string => !!value))];

/** Photos the user may pick from: their post images plus previous profile pictures and covers. */
export async function getPhotoLibrary(userId: string) {
  const [user, posts] = await Promise.all([
    User.findById(userId).select('profile').lean(),
    Post.find({ authorId: userId, deletedAt: null, 'media.0': { $exists: true } }).sort({ createdAt: -1 }).limit(60).select('media').lean()
  ]);
  if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
  const profile: any = (user as any).profile || {};
  const uploads = unique(posts.flatMap((post: any) => (post.media || []).filter((media: any) => String(media.mimeType).startsWith('image/')).map((media: any) => media.url)));
  const profilePictures = unique([profile.avatarUrl, ...(profile.avatarHistory || [])]);
  const coverPhotos = unique([profile.coverUrl, ...(profile.coverHistory || [])]);
  return { suggested: unique([...uploads, ...profilePictures, ...coverPhotos]).slice(0, 6), uploads, profilePictures, coverPhotos, current: { avatarUrl: profile.avatarUrl || '', coverUrl: profile.coverUrl || '' } };
}

/** Partial profile update used by the Edit profile / Edit details popups. */
export async function updateProfileDetails(userId: string, input: Record<string, string | undefined>) {
  if (input.username && await User.exists({ username: input.username, _id: { $ne: userId } })) throw new AppError(409, 'That username is already in use.', 'USERNAME_TAKEN');
  const fields: Record<string, string> = { displayName: 'displayName', username: 'username', bio: 'profile.bio', location: 'profile.location', website: 'profile.website', privacy: 'profile.privacy' };
  const update: Record<string, string> = {};
  for (const [key, path] of Object.entries(fields)) if (input[key] !== undefined) update[path] = input[key]!;
  if (!Object.keys(update).length) throw new AppError(422, 'Nothing to update.', 'EMPTY_UPDATE');
  const user = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true });
  await invalidateSocialCaches([userId]);
  return user;
}

/** Sets the profile picture or cover from a new upload, a photo from the library, or removes it. */
export async function setProfilePhoto(userId: string, input: { kind: 'avatar' | 'cover'; url?: string; remove: boolean }, file?: Express.Multer.File) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
  let url: string;
  if (file) url = `/uploads/${file.filename}`;
  else if (input.remove) url = '';
  else {
    const library = await getPhotoLibrary(userId);
    const allowed = new Set([...library.uploads, ...library.profilePictures, ...library.coverPhotos]);
    if (!input.url || !allowed.has(input.url)) throw new AppError(422, 'Choose one of your photos or upload a new one.', 'INVALID_PHOTO');
    url = input.url;
  }
  const field = input.kind === 'avatar' ? 'avatarUrl' : 'coverUrl';
  const historyField = input.kind === 'avatar' ? 'avatarHistory' : 'coverHistory';
  const profile: any = user.profile;
  profile[historyField] = unique([url, profile[field], ...(profile[historyField] || [])]).slice(0, HISTORY_LIMIT);
  profile[field] = url;
  await user.save();
  await invalidateSocialCaches([userId]);
  return user;
}
