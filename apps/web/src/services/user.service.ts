import { AUDIENCE_FIELDS, Follow, Friendship, Post, User } from '../models/index.js';
import type { ProfileList } from '../validators/index.js';
import { AppError } from '../utils/errors.js';
import { cacheGet, cacheSet, invalidateSocialCaches } from './cache.service.js';
import { notify } from './notification.service.js';
import { getFriendshipState } from './friendship.service.js';
import { assertNotBlocked, getSocialState } from './social.service.js';

export async function getProfile(username: string, viewerId?: string) {
  const user = await User.findOne({ username, deletedAt: null });
  if (!user) throw new AppError(404, 'Profile not found.', 'PROFILE_NOT_FOUND');
  const social = viewerId ? await getSocialState(viewerId, user.id) : { blocked: false, blockedByMe: false, seeLess: false, restrictPosts: false };
  if (social.blocked && !social.blockedByMe) throw new AppError(404, 'Profile not found.', 'PROFILE_NOT_FOUND');
  if (social.blockedByMe) return { _id: user._id, username: user.username, displayName: user.displayName, profile: {}, friends: 0, followers: 0, following: 0, isFollowing: false, isSelf: false, canViewDetails: false, friendState: 'none', ...social };
  const key = `profile:${user.id}`;
  let summary = await cacheGet<any>(key);
  if (!summary) {
    const [followers, following, friends] = await Promise.all([
      Follow.countDocuments({ followingId: user.id }),
      Follow.countDocuments({ followerId: user.id }),
      Friendship.countDocuments({ status: 'accepted', $or: [{ userAId: user.id }, { userBId: user.id }] })
    ]);
    summary = { ...user.toObject(), followers, following, friends };
    await cacheSet(key, summary, 120);
  }
  const isFollowing = viewerId ? !!(await Follow.exists({ followerId: viewerId, followingId: user.id })) : false;
  const isSelf = viewerId === user.id;
  const canViewDetails = summary.profile?.privacy === 'public' || isSelf || isFollowing;
  const friendState = viewerId ? await getFriendshipState(viewerId, user.id) : 'none';
  summary = { ...summary, profile: visibleProfile(summary.profile || {}, { isSelf, isFriend: friendState === 'friends', canViewDetails }) };
  return { ...summary, isFollowing, isSelf, canViewDetails, friendState, ...social };
}

const DEFAULT_AUDIENCE: Record<string, string> = { birthYear: 'only_me', contact: 'only_me' };
export const audienceOf = (profile: any, field: string): string => profile?.audience?.[field] || DEFAULT_AUDIENCE[field] || 'public';

/** Removes About details the viewer is not allowed to see (per-field audience + "followers only" profiles). */
export function visibleProfile(profile: any, viewer: { isSelf: boolean; isFriend: boolean; canViewDetails: boolean }) {
  if (viewer.isSelf) return profile;
  const allowed = (field: string) => {
    if (!viewer.canViewDetails) return false;
    const audience = audienceOf(profile, field);
    return audience === 'public' || (audience === 'friends' && viewer.isFriend);
  };
  const out = { ...profile };
  const hide: Record<string, () => void> = {
    work: () => { out.work = []; },
    education: () => { out.education = []; },
    location: () => { out.location = ''; },
    hometown: () => { out.hometown = ''; },
    birthday: () => { out.birthDay = null; out.birthMonth = null; },
    birthYear: () => { out.birthYear = null; },
    relationship: () => { out.relationship = ''; },
    gender: () => { out.gender = ''; },
    pronouns: () => { out.pronouns = ''; },
    languages: () => { out.languages = []; },
    contact: () => { out.phone = ''; out.publicEmail = ''; },
    links: () => { out.links = []; out.website = ''; }
  };
  for (const field of AUDIENCE_FIELDS) if (!allowed(field)) hide[field]!();
  if (!viewer.canViewDetails) Object.assign(out, { bio: '', coverUrl: '', about: '', quotes: '', otherNames: '', hobbies: [] });
  return out;
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
  await assertNotBlocked(actorId, targetId);
  const existing = await Follow.findOne({ followerId: actorId, followingId: targetId });
  if (existing) { await existing.deleteOne(); await invalidateSocialCaches([actorId, targetId]); return { following: false }; }
  await Follow.updateOne({ followerId: actorId, followingId: targetId }, { $setOnInsert: { followerId: actorId, followingId: targetId } }, { upsert: true });
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

const DETAIL_FIELDS: Record<string, string> = {
  displayName: 'displayName', username: 'username', bio: 'profile.bio', location: 'profile.location', website: 'profile.website', privacy: 'profile.privacy',
  hometown: 'profile.hometown', relationship: 'profile.relationship', birthDay: 'profile.birthDay', birthMonth: 'profile.birthMonth', birthYear: 'profile.birthYear',
  gender: 'profile.gender', pronouns: 'profile.pronouns', languages: 'profile.languages', hobbies: 'profile.hobbies', phone: 'profile.phone', publicEmail: 'profile.publicEmail',
  otherNames: 'profile.otherNames', about: 'profile.about', quotes: 'profile.quotes'
};

/** Partial profile update used by the Edit profile / Edit details popups and the About tab editors. */
export async function updateProfileDetails(userId: string, input: Record<string, any>) {
  if (input.username && await User.exists({ username: input.username, _id: { $ne: userId } })) throw new AppError(409, 'That username is already in use.', 'USERNAME_TAKEN');
  const update: Record<string, unknown> = {};
  for (const [key, path] of Object.entries(DETAIL_FIELDS)) if (input[key] !== undefined) update[path] = input[key];
  for (const [field, audience] of Object.entries(input.audience || {})) update[`profile.audience.${field}`] = audience;
  if (input.intro && Object.keys(input.intro).length) {
    const current = await User.findById(userId).select('profile.introHidden').lean();
    const hidden = new Set<string>((current as any)?.profile?.introHidden || []);
    for (const [item, shown] of Object.entries(input.intro)) { if (shown) hidden.delete(item); else hidden.add(item); }
    update['profile.introHidden'] = [...hidden];
  }
  if (!Object.keys(update).length) throw new AppError(422, 'Nothing to update.', 'EMPTY_UPDATE');
  const user = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true });
  await invalidateSocialCaches([userId]);
  return user;
}

const LIST_LIMITS: Record<ProfileList, number> = { work: 10, education: 10, links: 10 };
const LIST_LABELS: Record<ProfileList, string> = { work: 'workplaces', education: 'schools', links: 'links' };
const sortList = (list: ProfileList, items: any[]) => {
  if (list === 'work') items.sort((a, b) => Number(b.current) - Number(a.current) || (b.startDate?.getTime() || 0) - (a.startDate?.getTime() || 0));
  if (list === 'education') items.sort((a, b) => (b.endYear || b.startYear || 9999) - (a.endYear || a.startYear || 9999));
};

/** Adds, edits (itemId) or removes (item === null) one entry of a repeatable About section. */
export async function saveProfileListItem(userId: string, list: ProfileList, itemId: string | undefined, item: Record<string, unknown> | null) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
  const items = (user.profile as any)[list];
  const value = item && list === 'work' && item.current ? { ...item, endDate: null } : item;
  if (itemId) {
    const existing = items.id(itemId);
    if (!existing) throw new AppError(404, 'That entry no longer exists.', 'PROFILE_ITEM_NOT_FOUND');
    if (value === null) existing.deleteOne(); else existing.set(value);
  } else {
    if (value === null) throw new AppError(400, 'Choose an entry to remove.', 'PROFILE_ITEM_REQUIRED');
    if (items.length >= LIST_LIMITS[list]) throw new AppError(422, `You can add up to ${LIST_LIMITS[list]} ${LIST_LABELS[list]}.`, 'PROFILE_LIST_FULL');
    items.push(value);
  }
  const sorted = [...items]; sortList(list, sorted);
  (user.profile as any)[list] = sorted;
  await user.save();
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

/** Deletes one of your photos: clears it as avatar/cover, drops it from history and removes it from your posts. */
export async function deletePhoto(userId: string, url: string) {
  const library = await getPhotoLibrary(userId);
  if (![...library.uploads, ...library.profilePictures, ...library.coverPhotos].includes(url)) throw new AppError(404, 'Photo not found in your photos.', 'PHOTO_NOT_FOUND');
  const user = await User.findById(userId);
  const profile: any = user!.profile;
  if (profile.avatarUrl === url) profile.avatarUrl = '';
  if (profile.coverUrl === url) profile.coverUrl = '';
  profile.avatarHistory = (profile.avatarHistory || []).filter((item: string) => item !== url);
  profile.coverHistory = (profile.coverHistory || []).filter((item: string) => item !== url);
  await user!.save();
  const posts = await Post.find({ authorId: userId, deletedAt: null, 'media.url': url });
  let postsDeleted = 0;
  for (const post of posts) {
    post.media = post.media.filter((media: any) => media.url !== url);
    if (!post.content && !post.media.length && !post.feeling && !post.place) { post.deletedAt = new Date(); postsDeleted++; }
    await post.save();
  }
  await invalidateSocialCaches([userId]);
  return { postsUpdated: posts.length - postsDeleted, postsDeleted };
}
