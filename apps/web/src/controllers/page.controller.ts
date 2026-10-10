import type { Request, Response } from 'express';
import { Notification, Post, User } from '../models/index.js';
import { getFeed, searchAll } from '../services/feed.service.js';
import { getProfile } from '../services/user.service.js';
import { getPostDetail } from '../services/post.service.js';
import { getGroup, listGroups } from '../services/group.service.js';
import { listConversations, listMessages } from '../services/message.service.js';

const base = (req: Request, title: string) => ({ title, path: req.path, csrfToken: resToken(req), currentUser: req.user?.toObject() ?? null });
const resToken = (req: Request) => req.cookies?.csrf || '';
const param = (req: Request, name: string) => String(req.params[name]);

export function loginPage(req: Request, res: Response) { if (req.user) return res.redirect('/'); res.render('auth/login', base(req, 'Welcome back')); }
export function registerPage(req: Request, res: Response) { if (req.user) return res.redirect('/'); res.render('auth/register', base(req, 'Create your account')); }
export function resetPage(req: Request, res: Response) { res.render('auth/reset', { ...base(req, 'Reset password'), token: req.query.token || '' }); }
export async function home(req: Request, res: Response) { const result = await getFeed(req.user!.id); const suggestions = await User.find({ _id: { $ne: req.user!.id }, deletedAt: null }).limit(4).lean(); res.render('home', { ...base(req, 'Home'), posts: result.items, suggestions, cached: result.cached }); }
export async function profile(req: Request, res: Response) { const profile = await getProfile(param(req, 'username'), req.user?.id); const visibility = profile.isSelf ? {} : profile.isFollowing ? { visibility: { $in: ['public', 'followers'] } } : { visibility: 'public' }; const posts = await Post.find({ authorId: profile._id, groupId: null, deletedAt: null, ...visibility }).sort({ createdAt: -1 }).populate('authorId', 'username displayName profile.avatarUrl').lean(); res.render('profile', { ...base(req, profile.displayName), profile, posts }); }
export async function post(req: Request, res: Response) { const detail = await getPostDetail(param(req, 'postId'), req.user?.id); res.render('post', { ...base(req, 'Post'), ...detail }); }
export async function groups(req: Request, res: Response) { res.render('groups/index', { ...base(req, 'Groups'), groups: await listGroups(req.user?.id) }); }
export async function group(req: Request, res: Response) { const detail = await getGroup(param(req, 'slug'), req.user?.id); res.render('groups/detail', { ...base(req, detail.group.name), ...detail }); }
export async function messages(req: Request, res: Response) { const conversations = await listConversations(req.user!.id); res.render('messages', { ...base(req, 'Messages'), conversations, activeConversation: null, messages: [] }); }
export async function conversation(req: Request, res: Response) { const conversationId = param(req, 'conversationId'); const [conversations, items] = await Promise.all([listConversations(req.user!.id), listMessages(req.user!.id, conversationId)]); res.render('messages', { ...base(req, 'Messages'), conversations, activeConversation: conversationId, messages: items }); }
export async function notifications(req: Request, res: Response) { const items = await Notification.find({ recipientId: req.user!.id }).sort({ createdAt: -1 }).limit(50).populate('actorId', 'username displayName profile.avatarUrl').lean(); res.render('notifications', { ...base(req, 'Notifications'), notifications: items }); }
export async function search(req: Request, res: Response) { const q = String(req.query.q || '').trim(); const result = q.length >= 2 ? await searchAll(q) : { items: [] }; res.render('search', { ...base(req, 'Search'), q, results: result.items }); }
export function settings(req: Request, res: Response) { res.render('settings', base(req, 'Settings')); }

