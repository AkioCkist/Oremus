import type { NextFunction, Request, Response } from 'express';
import { Follow, GroupMember, Notification, Post, User } from '../models/index.js';
import { getFeed, searchAll } from '../services/feed.service.js';
import { getProfile } from '../services/user.service.js';
import { getPostDetail, withReactionSummary } from '../services/post.service.js';
import { getGroup, listGroups } from '../services/group.service.js';
import { countUnreadConversations, listConversations, listMessages, markConversationRead } from '../services/message.service.js';
import { getStoryTray, listArchive } from '../services/story.service.js';
import { AppError } from '../utils/errors.js';

const base = (req: Request, title: string) => ({ title, path: req.path, csrfToken: resToken(req), currentUser: req.user?.toObject() ?? null });
const resToken = (req: Request) => req.cookies?.csrf || '';
const param = (req: Request, name: string) => String(req.params[name]);
const AUTHOR_FIELDS = 'username displayName profile.avatarUrl';

/** Header badges: unread notifications and conversations with unread messages. */
export async function navState(req: Request, res: Response, next: NextFunction) {
  if (req.user) {
    const [unreadNotifications, unreadMessages] = await Promise.all([Notification.countDocuments({ recipientId: req.user.id, readAt: null }), countUnreadConversations(req.user.id)]);
    Object.assign(res.locals, { unreadNotifications, unreadMessages });
  }
  next();
}

async function myGroups(userId: string, limit = 8) {
  const memberships = await GroupMember.find({ userId }).sort({ createdAt: -1 }).limit(limit).populate('groupId', 'name slug coverUrl memberCount privacy').lean();
  return memberships.map((item: any) => item.groupId).filter(Boolean);
}

async function contacts(userId: string, limit = 12) {
  const follows = await Follow.find({ followerId: userId }).sort({ createdAt: -1 }).limit(limit).populate('followingId', AUTHOR_FIELDS).lean();
  return follows.map((item: any) => item.followingId).filter(Boolean);
}

export function loginPage(req: Request, res: Response) { if (req.user) return res.redirect('/'); res.render('auth/login', base(req, 'Log in')); }
export function registerPage(req: Request, res: Response) { if (req.user) return res.redirect('/'); res.render('auth/register', base(req, 'Create an account')); }
export function resetPage(req: Request, res: Response) { res.render('auth/reset', { ...base(req, 'Reset password'), token: req.query.token || '' }); }

export async function home(req: Request, res: Response) {
  const userId = req.user!.id;
  const [result, following, groups, tray, people] = await Promise.all([getFeed(userId), contacts(userId, 40), myGroups(userId), getStoryTray(userId), User.find({ _id: { $ne: userId }, deletedAt: null }).sort({ createdAt: -1 }).limit(20).select(AUTHOR_FIELDS).lean()]);
  const followingIds = new Set(following.map((user: any) => String(user._id)));
  const suggestions = people.filter((person: any) => !followingIds.has(String(person._id))).slice(0, 4);
  const posts = await withReactionSummary(result.items, userId);
  res.render('home', { ...base(req, 'Home'), posts, suggestions, contacts: following.slice(0, 12), groups, tray, cached: result.cached });
}

export async function profile(req: Request, res: Response) {
  const profile = await getProfile(param(req, 'username'), req.user?.id);
  const visibility = profile.isSelf ? {} : profile.isFollowing ? { visibility: { $in: ['public', 'followers'] } } : { visibility: 'public' };
  const raw = await Post.find({ authorId: profile._id, groupId: null, deletedAt: null, ...visibility }).sort({ createdAt: -1 }).limit(50).populate('authorId', AUTHOR_FIELDS).lean();
  const posts = await withReactionSummary(raw, req.user?.id);
  const photos = raw.flatMap((post: any) => (post.media || []).map((media: any) => ({ ...media, postId: post._id }))).slice(0, 9);
  const tray = req.user ? await getStoryTray(req.user.id, [String(profile._id)]) : [];
  const hasStory = tray.some((group) => group.author._id === String(profile._id));
  const followingPreview = await contacts(String(profile._id), 9);
  res.render('profile', { ...base(req, profile.displayName), profile, posts, photos, hasStory, followingPreview, tab: req.query.tab === 'about' ? 'about' : req.query.tab === 'photos' ? 'photos' : 'posts' });
}

export async function post(req: Request, res: Response) {
  const detail = await getPostDetail(param(req, 'postId'), req.user?.id);
  const [withSummary] = await withReactionSummary([detail.post as any], req.user?.id);
  res.render('post', { ...base(req, `${(detail.post as any).authorId?.displayName || 'Post'}`), post: withSummary, comments: detail.comments });
}

export async function groups(req: Request, res: Response) {
  const [all, mine] = await Promise.all([listGroups(req.user?.id), req.user ? myGroups(req.user.id, 20) : Promise.resolve([])]);
  res.render('groups/index', { ...base(req, 'Groups'), groups: all, myGroups: mine });
}

export async function group(req: Request, res: Response) {
  const detail = await getGroup(param(req, 'slug'), req.user?.id);
  const [posts, members, mine] = await Promise.all([
    withReactionSummary(detail.posts, req.user?.id),
    GroupMember.find({ groupId: detail.group._id }).sort({ createdAt: 1 }).limit(8).populate('userId', AUTHOR_FIELDS).lean(),
    req.user ? myGroups(req.user.id, 20) : Promise.resolve([])
  ]);
  res.render('groups/detail', { ...base(req, detail.group.name), ...detail, posts, members: members.map((item: any) => item.userId).filter(Boolean), myGroups: mine });
}

export async function messages(req: Request, res: Response) {
  const conversations = await listConversations(req.user!.id);
  res.render('messages', { ...base(req, 'Chats'), conversations, activeConversation: null, partner: null, messages: [] });
}

export async function conversation(req: Request, res: Response) {
  const userId = req.user!.id, conversationId = param(req, 'conversationId');
  const items = await listMessages(userId, conversationId);
  await markConversationRead(userId, conversationId);
  const [conversations, unreadMessages] = await Promise.all([listConversations(userId), countUnreadConversations(userId)]);
  res.locals.unreadMessages = unreadMessages;
  const active: any = conversations.find((item: any) => String(item._id) === conversationId);
  const partner = active?.memberIds.find((member: any) => String(member._id) !== userId) || active?.memberIds[0] || null;
  res.render('messages', { ...base(req, partner ? partner.displayName : 'Chats'), conversations, activeConversation: conversationId, partner, messages: items });
}

export async function notifications(req: Request, res: Response) {
  const items = await Notification.find({ recipientId: req.user!.id }).sort({ createdAt: -1 }).limit(50).populate('actorId', AUTHOR_FIELDS).lean();
  res.render('notifications', { ...base(req, 'Notifications'), notifications: items.filter((item: any) => item.actorId), filter: req.query.filter === 'unread' ? 'unread' : 'all' });
}

export async function search(req: Request, res: Response) {
  const q = String(req.query.q || '').trim();
  const kind = ['user', 'post', 'group'].includes(String(req.query.kind)) ? String(req.query.kind) : 'all';
  const result = q.length >= 2 ? await searchAll(q) : { items: [] };
  const results = (result.items as any[]).filter((item) => kind === 'all' || item.kind === kind);
  const following = q ? [] : await Follow.find({ followerId: req.user!.id }).select('followingId').lean();
  const people = q ? [] : await User.find({ _id: { $nin: [req.user!.id, ...following.map((item: any) => item.followingId)] }, deletedAt: null }).sort({ createdAt: -1 }).limit(24).select(`${AUTHOR_FIELDS} profile.bio`).lean();
  res.render('search', { ...base(req, 'Search'), q, kind, results, people });
}

export function settings(req: Request, res: Response) { res.render('settings', base(req, 'Settings')); }

export async function stories(req: Request, res: Response) {
  const username = req.params.username ? param(req, 'username') : null;
  const author = username ? await User.findOne({ username, deletedAt: null }).select('_id').lean() : null;
  if (username && !author) throw new AppError(404, 'Profile not found.', 'PROFILE_NOT_FOUND');
  const tray = await getStoryTray(req.user!.id, author ? [String((author as any)._id)] : []);
  let activeIndex = author ? tray.findIndex((group) => group.author._id === String((author as any)._id)) : tray.findIndex((group) => !group.isSelf);
  if (activeIndex === -1) activeIndex = tray.length ? 0 : -1;
  res.render('stories/index', { ...base(req, 'Stories'), tray, activeIndex, missingAuthor: !!author && !tray.some((group) => group.author._id === String((author as any)._id)) });
}

export async function storyArchive(req: Request, res: Response) {
  const items = await listArchive(req.user!.id);
  const tray = await getStoryTray(req.user!.id);
  res.render('stories/archive', { ...base(req, 'Story archive'), items, tray, now: Date.now() });
}
