import type { Request, Response } from 'express';
import { Follow, Notification } from '../models/index.js';
import { profileSchema, profileDetailsSchema, profilePhotoSchema, postSchema, postEditSchema, reactionSchema, commentSchema, groupSchema, decisionSchema, friendActionSchema, breakSchema, blockActionSchema, conversationSchema, messageSchema, groupJoinSchema, groupInviteSchema, placeNearbySchema, placeSearchSchema, photoDeleteSchema } from '../validators/index.js';
import { AppError } from '../utils/errors.js';
import * as users from '../services/user.service.js';
import * as posts from '../services/post.service.js';
import * as groups from '../services/group.service.js';
import * as messages from '../services/message.service.js';
import { changeFriendship as changeFriendshipState, getFriendshipState } from '../services/friendship.service.js';
import { blockedUserIds, getSocialState, setBlock, setBreak } from '../services/social.service.js';
import { emitUserEvent } from '../services/notification.service.js';
import { cacheStats } from '../services/cache.service.js';
import { nearbyPlaces, searchPlaces } from '../services/places.service.js';
import { searchAll } from '../services/feed.service.js';
import { audit } from '../services/audit.service.js';

const id = (req: Request) => req.user!.id;
const param = (req: Request, name: string) => String(req.params[name]);
export async function updateProfile(req: Request, res: Response) { const user = await users.updateProfile(id(req), profileSchema.parse(req.body), req.files as any); res.json({ ok: true, data: { user, redirect: `/profile/${user.username}` } }); }
export async function toggleFollow(req: Request, res: Response) { res.json({ ok: true, data: await users.toggleFollow(id(req), param(req, 'userId')) }); }
export async function changeFriendship(req: Request, res: Response) {
  const { action } = friendActionSchema.parse(req.body), actorId = id(req), targetId = param(req, 'userId');
  const result = await changeFriendshipState(actorId, targetId, action);
  for (const [viewerId, otherId] of [[actorId, targetId], [targetId, actorId]]) {
    const [state, following] = await Promise.all([getFriendshipState(viewerId, otherId), Follow.exists({ followerId: viewerId, followingId: otherId })]);
    emitUserEvent(viewerId, 'friendship:changed', { userId: otherId, state, following: !!following });
  }
  res.json({ ok: true, data: { ...result, following: !!(await Follow.exists({ followerId: actorId, followingId: targetId })) } });
}
export async function breakState(req: Request, res: Response) { res.json({ ok: true, data: await getSocialState(id(req), param(req, 'userId')) }); }
export async function takeBreak(req: Request, res: Response) { res.json({ ok: true, data: await setBreak(id(req), param(req, 'userId'), breakSchema.parse(req.body)) }); }
export async function blockUser(req: Request, res: Response) { const { blocked } = blockActionSchema.parse(req.body); res.json({ ok: true, data: await setBlock(id(req), param(req, 'userId'), blocked) }); }
export async function createPost(req: Request, res: Response) { const post = await posts.createPost(id(req), postSchema.parse(req.body), req.files as Express.Multer.File[]); res.status(201).json({ ok: true, data: { post } }); }
export async function postDetail(req: Request, res: Response) { const detail = await posts.getPostDetail(param(req, 'postId'), id(req)); const [post] = await posts.withReactionSummary([detail.post as any], id(req)); res.json({ ok: true, data: { post, comments: detail.comments } }); }
export async function updatePost(req: Request, res: Response) { res.json({ ok: true, data: { post: await posts.updatePost(id(req), param(req, 'postId'), postEditSchema.parse(req.body), req.files as Express.Multer.File[]), message: 'Post updated.' } }); }
export async function replacePostMedia(req: Request, res: Response) { res.json({ ok: true, data: { ...(await posts.replacePostMedia(id(req), param(req, 'postId'), param(req, 'mediaId'), req.file)), message: 'Media replaced.' } }); }
export async function removePostMedia(req: Request, res: Response) { const result = await posts.removePostMedia(id(req), param(req, 'postId'), param(req, 'mediaId')); res.json({ ok: true, data: { ...result, message: result.postDeleted ? 'Removed from post. The empty post was moved to trash.' : 'Removed from post.' } }); }
export async function deletePost(req: Request, res: Response) { const postId = param(req, 'postId'); await posts.deletePost(id(req), postId); await audit('post.delete', id(req), 'Post', postId, {}, req.ip); res.json({ ok: true, data: { deleted: true } }); }
export async function react(req: Request, res: Response) { const { type } = reactionSchema.parse(req.body); res.json({ ok: true, data: await posts.react(id(req), param(req, 'postId'), type) }); }
export async function comment(req: Request, res: Response) { const item = await posts.addComment(id(req), param(req, 'postId'), commentSchema.parse(req.body)); res.status(201).json({ ok: true, data: { comment: item } }); }
// Group forms are multipart (optional cover file) with the structured fields in a JSON `payload`.
function groupPayload(req: Request) {
  try { return groupSchema.parse(typeof req.body.payload === 'string' ? JSON.parse(req.body.payload) : req.body); }
  catch (error) { if (error instanceof SyntaxError) throw new AppError(400, 'Invalid group details.', 'INVALID_PAYLOAD'); throw error; }
}
export async function createGroup(req: Request, res: Response) { const group = await groups.createGroup(id(req), groupPayload(req), req.file); res.status(201).json({ ok: true, data: { group, redirect: `/groups/${group.slug}` } }); }
export async function updateGroup(req: Request, res: Response) { const group = await groups.updateGroup(id(req), param(req, 'groupId'), groupPayload(req), req.file); res.json({ ok: true, data: { group, redirect: `/groups/${group.slug}` } }); }
export async function requestJoin(req: Request, res: Response) { const result = await groups.requestJoin(id(req), param(req, 'groupId'), groupJoinSchema.parse(req.body || {})); res.status(201).json({ ok: true, data: { ...result, message: result.status === 'joined' ? 'You joined the group.' : 'Request sent to the group admins.' } }); }
export async function leaveGroup(req: Request, res: Response) { await groups.leaveGroup(id(req), param(req, 'groupId')); res.json({ ok: true, data: { left: true } }); }
export async function inviteToGroup(req: Request, res: Response) { const { userIds } = groupInviteSchema.parse(req.body); const result = await groups.inviteMembers(id(req), param(req, 'groupId'), userIds); res.json({ ok: true, data: { ...result, message: result.invited ? `Invited ${result.invited} ${result.invited === 1 ? 'person' : 'people'}.` : 'Everyone selected is already invited or a member.' } }); }
export async function decideGroupPost(req: Request, res: Response) { const { decision } = decisionSchema.parse(req.body); res.json({ ok: true, data: await groups.decidePost(id(req), param(req, 'postId'), decision) }); }
export async function decideJoin(req: Request, res: Response) { const { decision } = decisionSchema.parse(req.body); res.json({ ok: true, data: { request: await groups.decideJoin(id(req), param(req, 'requestId'), decision) } }); }
export async function createConversation(req: Request, res: Response) { const { memberId } = conversationSchema.parse(req.body); const conversation = await messages.createConversation(id(req), memberId); res.status(201).json({ ok: true, data: { conversation, redirect: `/messages/${conversation.id}` } }); }
export async function sendMessage(req: Request, res: Response) { const { content } = messageSchema.parse(req.body); const conversationId = param(req, 'conversationId'); const result = await messages.sendMessage(id(req), conversationId, content); for (const recipientId of result.recipients) emitUserEvent(recipientId, 'message:new', result.message); res.status(201).json({ ok: true, data: result }); }
export async function notifications(req: Request, res: Response) { const blocked = await blockedUserIds(id(req)); const items = await Notification.find({ recipientId: id(req), actorId: { $nin: blocked } }).sort({ createdAt: -1 }).limit(50).populate('actorId', 'username displayName profile.avatarUrl').lean(); res.json({ ok: true, data: { items } }); }
export async function readNotifications(req: Request, res: Response) { await Notification.updateMany({ recipientId: id(req), readAt: null }, { readAt: new Date() }); res.json({ ok: true, data: { updated: true } }); }
export async function search(req: Request, res: Response) { const q = String(req.query.q || '').trim(); res.json({ ok: true, data: q.length >= 2 ? await searchAll(q, id(req)) : { query: q, items: [] } }); }
export async function diagnostics(_req: Request, res: Response) { res.json({ ok: true, data: await cacheStats() }); }

export async function photoLibrary(req: Request, res: Response) { res.json({ ok: true, data: await users.getPhotoLibrary(id(req)) }); }
export async function updateDetails(req: Request, res: Response) { const user = await users.updateProfileDetails(id(req), profileDetailsSchema.parse(req.body)); res.json({ ok: true, data: { user, message: 'Profile updated.' } }); }
export async function updatePhoto(req: Request, res: Response) { const user = await users.setProfilePhoto(id(req), profilePhotoSchema.parse(req.body), req.file); res.json({ ok: true, data: { user, message: 'Photo updated.' } }); }
export async function places(req: Request, res: Response) { const { q, lat, lon } = placeSearchSchema.parse(req.query); res.json({ ok: true, data: { places: await searchPlaces(q, lat !== undefined && lon !== undefined ? { lat, lon } : undefined) } }); }
export async function placesNearby(req: Request, res: Response) { const { lat, lon } = placeNearbySchema.parse(req.query); res.json({ ok: true, data: { places: await nearbyPlaces(lat, lon) } }); }
export async function deletePhoto(req: Request, res: Response) { const { url } = photoDeleteSchema.parse(req.body); const result = await users.deletePhoto(id(req), url); res.json({ ok: true, data: { ...result, message: 'Photo deleted.' } }); }
