import { Follow, Group, GroupInvite, GroupJoinRequest, GroupMember, Post, User } from '../models/index.js';
import { slugify } from '../utils/slug.js';
import { AppError } from '../utils/errors.js';
import { cacheGet, cacheSet, invalidateByPrefix, invalidateSocialCaches } from './cache.service.js';
import { notify } from './notification.service.js';
import { getPhotoLibrary } from './user.service.js';

const PERSON_FIELDS = 'username displayName profile.avatarUrl';

/** Built-in cover artwork offered in the group cover picker (served from /public). */
export const GROUP_ARTWORK = [
  '/assets/img/art/waves.svg', '/assets/img/art/confetti.svg', '/assets/img/art/peaks.svg', '/assets/img/art/city.svg', '/assets/img/art/leaves.svg', '/assets/img/art/grid.svg',
  '/assets/img/seed/garden-cover.svg', '/assets/img/seed/photo-cover.svg', '/assets/img/seed/cover-maya.svg', '/assets/img/default-cover.svg'
];

export const GROUP_TYPE_LABELS: Record<string, string> = {
  general: 'General', social: 'Social', learning: 'Social learning', hobbies: 'Hobbies & interests', buy_sell: 'Buy and sell', gaming: 'Gaming', jobs: 'Jobs', parenting: 'Parenting', work: 'Work'
};

type GroupInput = {
  name: string; description: string; privacy: 'public' | 'private'; visibility: 'visible' | 'hidden'; groupType: string; location: string; tags: string[];
  rules: Array<{ title: string; details: string }>; questions: string[]; settings: { whoCanPost: string; postApproval: boolean; whoCanApprove: string };
  coverUrl?: string; removeCover: boolean; invite: string[];
};

const isManager = (member: any) => !!member && ['admin', 'moderator'].includes(member.role);
const membership = (groupId: unknown, userId?: string) => (userId ? GroupMember.findOne({ groupId, userId }).lean() : Promise.resolve(null));

/** Resolves the cover from an upload, built-in artwork, the user's own photos, or keeps/removes the current one. */
async function resolveCover(userId: string, input: GroupInput, file: Express.Multer.File | undefined, current: string): Promise<string> {
  if (file) return `/uploads/${file.filename}`;
  if (input.removeCover) return '';
  if (!input.coverUrl || input.coverUrl === current) return current;
  if (GROUP_ARTWORK.includes(input.coverUrl)) return input.coverUrl;
  const library = await getPhotoLibrary(userId);
  if ([...library.uploads, ...library.profilePictures, ...library.coverPhotos].includes(input.coverUrl)) return input.coverUrl;
  throw new AppError(422, 'Choose artwork, one of your photos, or upload a new cover.', 'INVALID_COVER');
}

async function addMember(groupId: unknown, userId: string, role: 'admin' | 'moderator' | 'member' = 'member') {
  const result = await GroupMember.updateOne({ groupId, userId }, { $setOnInsert: { role } }, { upsert: true });
  if (result.upsertedCount) await Group.updateOne({ _id: groupId }, { $inc: { memberCount: 1 } });
  await GroupInvite.deleteMany({ groupId, userId });
  await invalidateByPrefix(`group:${groupId}`);
}

export async function listGroups(userId?: string) {
  const memberships = userId ? await GroupMember.find({ userId }).select('groupId').lean() : [];
  const memberIds = memberships.map((item: any) => item.groupId);
  const memberSet = new Set(memberIds.map(String));
  const groups = await Group.find({ $or: [{ visibility: { $ne: 'hidden' } }, { _id: { $in: memberIds } }] }).sort({ memberCount: -1, createdAt: -1 }).limit(50).lean();
  return groups.map((group: any) => ({ ...group, isMember: memberSet.has(String(group._id)) }));
}

export async function createGroup(ownerId: string, input: GroupInput, file?: Express.Multer.File) {
  const base = slugify(input.name) || 'group'; let slug = base, suffix = 1;
  while (await Group.exists({ slug })) slug = `${base}-${++suffix}`;
  const coverUrl = await resolveCover(ownerId, input, file, '');
  const { invite, removeCover: _removeCover, coverUrl: _coverUrl, ...fields } = input;
  void _removeCover; void _coverUrl;
  const group = await Group.create({ ...fields, coverUrl, slug, ownerId, memberCount: 1 });
  await GroupMember.create({ groupId: group.id, userId: ownerId, role: 'admin' });
  if (invite.length) await inviteMembers(ownerId, group.id, invite);
  await invalidateSocialCaches([ownerId]);
  return group;
}

export async function updateGroup(userId: string, groupId: string, input: GroupInput, file?: Express.Multer.File) {
  const group = await Group.findById(groupId);
  if (!group) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  const member: any = await membership(groupId, userId);
  if (member?.role !== 'admin') throw new AppError(403, 'Only admins can change group settings.', 'GROUP_ADMIN_REQUIRED');
  const coverUrl = await resolveCover(userId, input, file, group.coverUrl);
  const { invite, removeCover: _removeCover, coverUrl: _coverUrl, ...fields } = input;
  void _removeCover; void _coverUrl;
  group.set({ ...fields, coverUrl });
  await group.save();
  if (invite.length) await inviteMembers(userId, groupId, invite);
  await Promise.all([invalidateByPrefix(`group:${groupId}`), invalidateSocialCaches([userId])]);
  return group;
}

export async function getGroup(slug: string, userId?: string) {
  const found: any = await Group.findOne({ slug }).select('_id').lean();
  if (!found) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  const key = `group:${found._id}`;
  let group = await cacheGet<any>(key);
  if (!group) { group = await Group.findById(found._id).lean(); await cacheSet(key, group, 180); }
  const [member, pendingRequest, invite]: any[] = await Promise.all([
    membership(group._id, userId),
    userId ? GroupJoinRequest.exists({ groupId: group._id, userId, status: 'pending' }) : null,
    userId ? GroupInvite.findOne({ groupId: group._id, userId }).populate('invitedBy', PERSON_FIELDS).lean() : null
  ]);
  if (group.visibility === 'hidden' && !member && !invite) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  const canManage = isManager(member);
  const canApprove = canManage || (!!member && group.settings?.whoCanApprove === 'anyone');
  const canPost = !!member && (group.settings?.whoCanPost !== 'admins' || canManage);
  const canSee = group.privacy === 'public' || !!member;
  const [posts, requests, pendingPosts, myPending] = await Promise.all([
    canSee ? Post.find({ groupId: group._id, deletedAt: null, groupStatus: { $nin: ['pending', 'declined'] } }).sort({ createdAt: -1 }).limit(50).populate('authorId', PERSON_FIELDS).lean() : [],
    canApprove ? GroupJoinRequest.find({ groupId: group._id, status: 'pending' }).sort({ createdAt: 1 }).populate('userId', PERSON_FIELDS).lean() : [],
    canManage ? Post.find({ groupId: group._id, deletedAt: null, groupStatus: 'pending' }).sort({ createdAt: 1 }).populate('authorId', PERSON_FIELDS).lean() : [],
    member && !canManage ? Post.countDocuments({ groupId: group._id, authorId: userId, deletedAt: null, groupStatus: 'pending' }) : 0
  ]);
  return { group, member, pending: !!pendingRequest, invite, posts, requests, pendingPosts, myPending, canManage, canApprove, canPost, isAdmin: member?.role === 'admin' };
}

export async function requestJoin(userId: string, groupId: string, input: { answers: string[]; agreeRules: boolean }) {
  if (await GroupMember.exists({ groupId, userId })) throw new AppError(409, 'You are already a member.', 'ALREADY_MEMBER');
  const group = await Group.findById(groupId);
  if (!group) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  const invite = await GroupInvite.findOne({ groupId, userId });
  if (group.visibility === 'hidden' && !invite) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  if (group.privacy === 'public' || invite?.byAdmin) {
    await addMember(groupId, userId);
    await invalidateSocialCaches([userId]);
    return { status: 'joined' as const };
  }
  if (group.rules.length && !input.agreeRules) throw new AppError(422, 'Please agree to the group rules to continue.', 'RULES_NOT_ACCEPTED');
  const questions: string[] = group.questions || [];
  if (questions.some((_question, index) => !input.answers[index]?.trim())) throw new AppError(422, 'Please answer all membership questions.', 'ANSWERS_REQUIRED');
  const existing = await GroupJoinRequest.findOne({ groupId, userId, status: 'pending' });
  if (existing) return { status: 'pending' as const };
  await GroupJoinRequest.create({ groupId, userId, agreedToRules: input.agreeRules, answers: questions.map((question, index) => ({ question, answer: input.answers[index]?.trim() || '' })) });
  await notify({ recipientId: String(group.ownerId), actorId: userId, type: 'group_request', entityType: 'Group', entityId: groupId, text: `requested to join ${group.name}` });
  return { status: 'pending' as const };
}

export async function leaveGroup(userId: string, groupId: string) {
  const group = await Group.findById(groupId).select('ownerId').lean();
  if (!group) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  if (String((group as any).ownerId) === userId) throw new AppError(400, 'The group creator cannot leave the group.', 'OWNER_CANNOT_LEAVE');
  const result = await GroupMember.deleteOne({ groupId, userId });
  if (result.deletedCount) await Group.updateOne({ _id: groupId }, { $inc: { memberCount: -1 } });
  await Promise.all([invalidateByPrefix(`group:${groupId}`), invalidateSocialCaches([userId])]);
}

export async function decideJoin(deciderId: string, requestId: string, decision: 'approve' | 'reject') {
  const request = await GroupJoinRequest.findOne({ _id: requestId, status: 'pending' });
  if (!request) throw new AppError(404, 'Join request not found.', 'REQUEST_NOT_FOUND');
  const [group, member]: any[] = await Promise.all([Group.findById(request.groupId).select('settings').lean(), membership(request.groupId, deciderId)]);
  if (!isManager(member) && !(member && group?.settings?.whoCanApprove === 'anyone')) throw new AppError(403, 'You cannot review requests for this group.', 'GROUP_ADMIN_REQUIRED');
  request.status = decision === 'approve' ? 'approved' : 'rejected'; request.reviewedBy = deciderId as any; request.reviewedAt = new Date(); await request.save();
  if (decision === 'approve') await addMember(request.groupId, String(request.userId));
  await invalidateSocialCaches([deciderId, String(request.userId)]);
  return request;
}

export async function inviteMembers(inviterId: string, groupId: string, userIds: string[]) {
  const [group, member]: any[] = await Promise.all([Group.findById(groupId).select('name').lean(), membership(groupId, inviterId)]);
  if (!group) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  if (!member) throw new AppError(403, 'Join this group before inviting people.', 'GROUP_MEMBERSHIP_REQUIRED');
  const unique = [...new Set(userIds)].filter((id) => id !== inviterId);
  const [users, members] = await Promise.all([User.find({ _id: { $in: unique }, deletedAt: null }).select('_id').lean(), GroupMember.find({ groupId, userId: { $in: unique } }).select('userId').lean()]);
  const memberSet = new Set(members.map((item: any) => String(item.userId)));
  const targets = users.map((user: any) => String(user._id)).filter((id) => !memberSet.has(id));
  for (const userId of targets) {
    await GroupInvite.updateOne({ groupId, userId }, { $set: { invitedBy: inviterId, byAdmin: isManager(member) } }, { upsert: true });
    await notify({ recipientId: userId, actorId: inviterId, type: 'group_invite', entityType: 'Group', entityId: groupId, text: `invited you to join ${group.name}` });
  }
  return { invited: targets.length };
}

export async function decidePost(deciderId: string, postId: string, decision: 'approve' | 'reject') {
  const post = await Post.findOne({ _id: postId, deletedAt: null, groupStatus: 'pending' });
  if (!post) throw new AppError(404, 'Pending post not found.', 'POST_NOT_FOUND');
  if (!isManager(await membership(post.groupId, deciderId))) throw new AppError(403, 'Only admins and moderators can review posts.', 'GROUP_ADMIN_REQUIRED');
  post.groupStatus = decision === 'approve' ? 'approved' : 'declined'; await post.save();
  const group: any = await Group.findById(post.groupId).select('name').lean();
  await notify({ recipientId: String(post.authorId), actorId: deciderId, type: 'group_post', entityType: 'Group', entityId: String(post.groupId), text: decision === 'approve' ? `approved your post in ${group?.name}` : `declined your post in ${group?.name}` });
  await invalidateSocialCaches([deciderId, String(post.authorId)]);
  return { status: post.groupStatus };
}

/** People you follow or who follow you that are not yet in the group — for the invite list. */
export async function inviteCandidates(userId: string, groupId: unknown) {
  const [following, followers, members, invites] = await Promise.all([
    Follow.find({ followerId: userId }).select('followingId').lean(),
    Follow.find({ followingId: userId }).select('followerId').lean(),
    GroupMember.find({ groupId }).select('userId').lean(),
    GroupInvite.find({ groupId }).select('userId').lean()
  ]);
  const excluded = new Set([userId, ...members.map((item: any) => String(item.userId))]);
  const invited = new Set(invites.map((item: any) => String(item.userId)));
  const ids = [...new Set([...following.map((item: any) => String(item.followingId)), ...followers.map((item: any) => String(item.followerId))])].filter((id) => !excluded.has(id));
  const people = await User.find({ _id: { $in: ids }, deletedAt: null }).select(PERSON_FIELDS).limit(100).lean();
  return people.map((person: any) => ({ ...person, invited: invited.has(String(person._id)) }));
}
