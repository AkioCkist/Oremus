import { Group, GroupJoinRequest, GroupMember, Post } from '../models/index.js';
import { slugify } from '../utils/slug.js';
import { AppError } from '../utils/errors.js';
import { cacheGet, cacheSet, invalidateSocialCaches } from './cache.service.js';
import { notify } from './notification.service.js';

export async function listGroups(userId?: string) {
  const groups = await Group.find().sort({ memberCount: -1, createdAt: -1 }).limit(50).lean();
  const memberships = userId ? await GroupMember.find({ userId, groupId: { $in: groups.map((g: any) => g._id) } }).lean() : [];
  const memberSet = new Set(memberships.map((m: any) => String(m.groupId)));
  return groups.map((group: any) => ({ ...group, isMember: memberSet.has(String(group._id)) }));
}

export async function createGroup(ownerId: string, input: any) {
  const base = slugify(input.name) || 'circle'; let slug = base, suffix = 1;
  while (await Group.exists({ slug })) slug = `${base}-${++suffix}`;
  const group = await Group.create({ ...input, slug, ownerId });
  await GroupMember.create({ groupId: group.id, userId: ownerId, role: 'admin' });
  await invalidateSocialCaches([ownerId]);
  return group;
}

export async function getGroup(slug: string, userId?: string) {
  const group: any = await Group.findOne({ slug }).lean();
  if (!group) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  const key = `group:${group._id}`; let summary = await cacheGet<any>(key);
  if (!summary) { summary = group; await cacheSet(key, group, 180); }
  const member: any = userId ? await GroupMember.findOne({ groupId: group._id, userId }).lean() : null;
  const pending = userId ? await GroupJoinRequest.exists({ groupId: group._id, userId, status: 'pending' }) : false;
  const posts = group.privacy === 'public' || member ? await Post.find({ groupId: group._id, deletedAt: null }).sort({ createdAt: -1 }).populate('authorId', 'username displayName profile.avatarUrl').lean() : [];
  const requests = member && ['admin', 'moderator'].includes(member.role) ? await GroupJoinRequest.find({ groupId: group._id, status: 'pending' }).populate('userId', 'username displayName profile.avatarUrl').lean() : [];
  return { group: summary, member, pending: !!pending, posts, requests };
}

export async function requestJoin(userId: string, groupId: string) {
  if (await GroupMember.exists({ groupId, userId })) throw new AppError(409, 'You are already a member.', 'ALREADY_MEMBER');
  const group = await Group.findById(groupId); if (!group) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  const existing = await GroupJoinRequest.findOne({ groupId, userId, status: 'pending' });
  if (existing) return existing;
  const request = await GroupJoinRequest.create({ groupId, userId });
  await notify({ recipientId: String(group.ownerId), actorId: userId, type: 'group_request', entityType: 'Group', entityId: groupId, text: `requested to join ${group.name}` });
  return request;
}

export async function decideJoin(adminId: string, requestId: string, decision: 'approve' | 'reject') {
  const request = await GroupJoinRequest.findOne({ _id: requestId, status: 'pending' });
  if (!request) throw new AppError(404, 'Join request not found.', 'REQUEST_NOT_FOUND');
  const admin = await GroupMember.findOne({ groupId: request.groupId, userId: adminId, role: { $in: ['admin', 'moderator'] } });
  if (!admin) throw new AppError(403, 'Only group admins can review requests.', 'GROUP_ADMIN_REQUIRED');
  request.status = decision === 'approve' ? 'approved' : 'rejected'; request.reviewedBy = adminId as any; request.reviewedAt = new Date(); await request.save();
  if (decision === 'approve') {
    await GroupMember.updateOne({ groupId: request.groupId, userId: request.userId }, { $setOnInsert: { role: 'member' } }, { upsert: true });
    await Group.updateOne({ _id: request.groupId }, { $inc: { memberCount: 1 } });
  }
  await invalidateSocialCaches([adminId, String(request.userId)]);
  return request;
}

