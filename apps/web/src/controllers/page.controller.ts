import type { NextFunction, Request, Response } from 'express';
import { Follow, Group, GroupMember, Message, Notification, Post, User } from '../models/index.js';
import { FEED_PAGE_SIZE, getFeed, searchAll } from '../services/feed.service.js';
import { getProfile } from '../services/user.service.js';
import { recordQuery } from '../services/search.service.js';
import { getPostDetail, withReactionSummary } from '../services/post.service.js';
import { GROUP_ARTWORK, GROUP_TYPE_LABELS, getGroup, inviteCandidates, listGroups } from '../services/group.service.js';
import { conversationChunk, countUnreadConversations, countUnreadNotifications, listConversations, listMessages, markConversationRead } from '../services/message.service.js';
import { getStoryTray, listArchive } from '../services/story.service.js';
import { getFriendshipStates, listFriends } from '../services/friendship.service.js';
import { blockedUserIds } from '../services/social.service.js';
import { groupMembers, groupPosts, notificationChunk, profileMedia, profileMediaCounts, profilePosts, MEDIA_SORTS, MEDIA_TYPES } from '../services/lists.service.js';
import { AppError } from '../utils/errors.js';
import { trackSignal } from '../services/activity.service.js';
import { getRecommendations } from '../services/recommendation.service.js';

const base = (req: Request, title: string) => ({ title, path: req.path, csrfToken: resToken(req), currentUser: req.user?.toObject() ?? null });
const resToken = (req: Request) => req.cookies?.csrf || '';
const param = (req: Request, name: string) => String(req.params[name]);
const AUTHOR_FIELDS = 'username displayName profile.avatarUrl';

/** Header badges and compact popover previews. Also served live by GET /api/live. */
export async function headerState(userId: string) {
  const blocked = await blockedUserIds(userId);
  const notificationFilter = { recipientId: userId, actorId: { $nin: blocked } };
  const [unreadNotifications, unreadMessages, headerConversations, headerNotificationRows] = await Promise.all([
    Notification.countDocuments({ ...notificationFilter, readAt: null }),
    countUnreadConversations(userId),
    listConversations(userId, 8),
    Notification.find(notificationFilter).sort({ createdAt: -1 }).limit(8).populate('actorId', AUTHOR_FIELDS).lean()
  ]);
  const headerNotifications = headerNotificationRows.filter((item: any) => item.actorId);
  return { unreadNotifications, unreadMessages, headerConversations, headerNotifications };
}

export async function navState(req: Request, res: Response, next: NextFunction) {
  if (req.user) Object.assign(res.locals, await headerState(req.user.id));
  next();
}

async function myGroups(userId: string, limit = 8) {
  const memberships = await GroupMember.find({ userId }).sort({ createdAt: -1 }).limit(limit).populate('groupId', 'name slug coverUrl memberCount privacy').lean();
  return memberships.map((item: any) => item.groupId).filter(Boolean);
}

export function loginPage(req: Request, res: Response) { if (req.user) return res.redirect('/'); res.render('auth/login', base(req, 'Log in')); }
export function registerPage(req: Request, res: Response) { if (req.user) return res.redirect('/'); res.render('auth/register', base(req, 'Create an account')); }
export function resetPage(req: Request, res: Response) { res.render('auth/reset', { ...base(req, 'Reset password'), token: req.query.token || '' }); }

export async function home(req: Request, res: Response) {
  const userId = req.user!.id;
  const [result, friends, groups, tray, recommended] = await Promise.all([getFeed(userId), listFriends(userId, 40), myGroups(userId), getStoryTray(userId), recommendationsFor(req, userId)]);
  // People, groups, posts and stories come from the recommender: what you search, read and open, plus mutual friends.
  const posts = await withReactionSummary(result.items, userId);
  res.render('home', {
    ...base(req, 'Home'), posts, next: result.hasMore ? `o${FEED_PAGE_SIZE}` : null, contacts: friends.slice(0, 12), groups, tray, cached: result.cached,
    suggestions: recommended.people.slice(0, 6), suggestedGroups: recommended.groups.slice(0, 3), suggestedPosts: recommended.posts.slice(0, 6), suggestedStories: recommended.stories.slice(0, 6)
  });
}

const ABOUT_SECTIONS = ['overview', 'work', 'places', 'contact', 'relationship', 'details', 'hobbies'];

export async function profile(req: Request, res: Response) {
  const profile = await getProfile(param(req, 'username'), req.user?.id);
  if (!profile.blockedByMe) trackSignal(req.user?.id, { type: 'open', targetType: 'user', targetId: String(profile._id) });
  if (profile.blockedByMe) return res.render('profile', { ...base(req, profile.displayName), profile, posts: [], postsNext: null, photos: [], photosNext: null, mediaCounts: { all: 0, photos: 0, videos: 0 }, mediaFilter: { type: 'all', sort: 'newest' }, hasStory: false, friendsPreview: [], tab: 'posts', profileQuery: '', aboutSection: 'overview' });
  const profileQuery = String(req.query.q || '').trim().slice(0, 80);
  const tab = profileQuery ? 'posts' : req.query.tab === 'about' ? 'about' : ['media', 'photos', 'videos'].includes(String(req.query.tab)) ? 'media' : 'posts';
  const mediaFilter = {
    type: MEDIA_TYPES.includes(String(req.query.type)) ? String(req.query.type) : req.query.tab === 'photos' ? 'photos' : req.query.tab === 'videos' ? 'videos' : 'all',
    sort: String(req.query.sort) in MEDIA_SORTS ? String(req.query.sort) : 'newest'
  };
  const username = profile.username as string;
  // Posts and media tiles load in chunks (first chunk here, the rest via /api/lists).
  const [postChunk, mediaChunk, mediaCounts] = await Promise.all([
    tab === 'posts' ? profilePosts(username, req.user?.id, profileQuery, null) : Promise.resolve({ items: [], next: null }),
    profileMedia(username, req.user?.id, tab === 'media' ? mediaFilter.type : 'all', tab === 'media' ? mediaFilter.sort : 'newest', null),
    profileMediaCounts(username, req.user?.id)
  ]);
  const photos = tab === 'media' ? mediaChunk.items : mediaChunk.items.slice(0, 9);
  const tray = req.user ? await getStoryTray(req.user.id, [String(profile._id)]) : [];
  const hasStory = tray.some((group) => group.author._id === String(profile._id));
  const friendsPreview = await listFriends(String(profile._id), 9);
  const aboutSection = ABOUT_SECTIONS.includes(String(req.query.section)) ? String(req.query.section) : 'overview';
  res.render('profile', { ...base(req, profile.displayName), profile, posts: postChunk.items, postsNext: postChunk.next, photos, photosNext: tab === 'media' ? mediaChunk.next : null, mediaCounts, mediaFilter, hasStory, friendsPreview, profileQuery, aboutSection, tab });
}

export async function post(req: Request, res: Response) {
  const detail = await getPostDetail(param(req, 'postId'), req.user?.id);
  trackSignal(req.user?.id, { type: 'open', targetType: 'post', targetId: String((detail.post as any)._id) });
  const [withSummary] = await withReactionSummary([detail.post as any], req.user?.id);
  res.render('post', { ...base(req, `${(detail.post as any).authorId?.displayName || 'Post'}`), post: withSummary, comments: detail.comments, commentsNext: detail.commentsNext, canModerate: detail.canModerate });
}

export async function groups(req: Request, res: Response) {
  const [directory, mine, candidates] = await Promise.all([listGroups(req.user?.id), req.user ? myGroups(req.user.id, 20) : Promise.resolve([]), req.user ? inviteCandidates(req.user.id, null) : Promise.resolve([])]);
  res.render('groups/index', { ...base(req, 'Groups'), groups: directory.items, groupsNext: directory.next, myGroups: mine, groupArtwork: GROUP_ARTWORK, groupTypes: GROUP_TYPE_LABELS, inviteCandidates: candidates, openCreate: req.query.create === '1' });
}

const GROUP_TABS = ['discussion', 'about', 'members', 'requests', 'pending'];

export async function group(req: Request, res: Response) {
  const detail = await getGroup(param(req, 'slug'), req.user?.id);
  const groupId = detail.group._id;
  trackSignal(req.user?.id, { type: 'open', targetType: 'group', targetId: String(groupId) });
  const canSee = detail.canSee;
  let tab = GROUP_TABS.includes(String(req.query.tab)) ? String(req.query.tab) : 'discussion';
  // Tabs the viewer has no access to fall back to the discussion.
  if ((tab === 'requests' && !detail.canApprove) || (tab === 'pending' && !detail.canManage)) tab = 'discussion';
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000), monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const visiblePosts = { groupId, deletedAt: null, groupStatus: { $nin: ['pending', 'declined'] } };
  const empty = { items: [], next: null };
  const [postChunk, members, mine, candidates, staff, memberChunk, activity] = await Promise.all([
    tab === 'discussion' && canSee ? groupPosts(groupId, req.user?.id, null) : Promise.resolve(empty),
    GroupMember.find({ groupId }).sort({ createdAt: 1 }).limit(8).populate('userId', AUTHOR_FIELDS).lean(),
    req.user ? myGroups(req.user.id, 20) : Promise.resolve([]),
    req.user && detail.member ? inviteCandidates(req.user.id, groupId) : Promise.resolve([]),
    // Admins and moderators are always listed on About, as on Facebook, even for private groups.
    tab === 'about' || tab === 'members' ? GroupMember.find({ groupId, role: { $in: ['admin', 'moderator'] } }).sort({ role: 1, createdAt: 1 }).limit(20).populate('userId', AUTHOR_FIELDS).lean() : Promise.resolve([]),
    tab === 'members' && canSee ? groupMembers(groupId, req.user?.id, null) : Promise.resolve(empty),
    tab === 'about' && canSee ? Promise.all([Post.countDocuments({ ...visiblePosts, createdAt: { $gte: dayAgo } }), Post.countDocuments({ ...visiblePosts, createdAt: { $gte: monthAgo } }), GroupMember.countDocuments({ groupId, createdAt: { $gte: monthAgo } })]) : Promise.resolve(null)
  ]);
  const withUser = (rows: any[]) => rows.filter((row) => row.userId).map((row) => ({ ...row.userId, role: row.role, joinedAt: row.createdAt }));
  res.render('groups/detail', {
    ...base(req, detail.group.name), ...detail, posts: postChunk.items, postsNext: postChunk.next, tab,
    members: members.map((item: any) => item.userId).filter(Boolean),
    staff: withUser(staff), allMembers: memberChunk.items, membersNext: memberChunk.next,
    activity: activity ? { postsToday: activity[0], postsMonth: activity[1], newMembersMonth: activity[2] } : null,
    myGroups: mine, groupArtwork: GROUP_ARTWORK, groupTypes: GROUP_TYPE_LABELS, inviteCandidates: candidates
  });
}

/** Stable link for notifications that only know the group id. */
export async function groupById(req: Request, res: Response) {
  const group: any = await Group.findById(param(req, 'groupId')).select('slug').lean().catch(() => null);
  if (!group) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  res.redirect(`/groups/${group.slug}`);
}

export async function messages(req: Request, res: Response) {
  const conversations = await conversationChunk(req.user!.id, null);
  res.render('messages', { ...base(req, 'Chats'), conversations: conversations.items, conversationsNext: conversations.next, activeConversation: null, partner: null, messages: [], messagesNext: null });
}

export async function conversation(req: Request, res: Response) {
  const userId = req.user!.id, conversationId = param(req, 'conversationId');
  const chunk = await listMessages(userId, conversationId);
  await markConversationRead(userId, conversationId);
  // Only the newest chunk is loaded, so the totals in the details panel come from the database.
  const [{ items: conversations, next: conversationsNext }, unreadMessages, unreadNotifications, messageCount, firstMessage] = await Promise.all([
    conversationChunk(userId, null), countUnreadConversations(userId), countUnreadNotifications(userId),
    Message.countDocuments({ conversationId, deletedAt: null }), Message.findOne({ conversationId, deletedAt: null }).sort({ createdAt: 1 }).select('createdAt').lean()
  ]);
  // The header counts were taken before this chat was marked read.
  Object.assign(res.locals, { unreadMessages, unreadNotifications });
  const active: any = conversations.find((item: any) => String(item._id) === conversationId);
  const partner = active?.memberIds.find((member: any) => String(member._id) !== userId) || active?.memberIds[0] || null;
  res.render('messages', { ...base(req, partner ? partner.displayName : 'Chats'), conversations, conversationsNext, activeConversation: conversationId, partner, messages: chunk.items, messagesNext: chunk.next, messageCount, firstMessageAt: (firstMessage as any)?.createdAt || null });
}

export async function notifications(req: Request, res: Response) {
  const filter = req.query.filter === 'unread' ? 'unread' : 'all';
  const openedAt = new Date();
  const chunk = await notificationChunk(req.user!.id, filter === 'unread', openedAt, null);
  // Opening the page marks everything read at `openedAt`; this visit (and its later chunks) still highlights what was new.
  await Notification.updateMany({ recipientId: req.user!.id, readAt: null }, { readAt: openedAt });
  res.locals.unreadNotifications = 0;
  res.render('notifications', { ...base(req, 'Notifications'), items: chunk.items, next: chunk.next, openedAt, filter });
}

export async function search(req: Request, res: Response) {
  const q = String(req.query.q || '').trim();
  const kind = ['user', 'post', 'group'].includes(String(req.query.kind)) ? String(req.query.kind) : 'all';
  const result = q.length >= 2 ? await searchAll(q, req.user!.id) : { items: [] };
  // A keyword search lands here (header, search page, typeahead), so this is where it's remembered.
  if (q.length >= 2) await recordQuery(req.user!.id, q).catch((error) => req.log?.warn({ error }, 'Could not save recent search'));
  if (q.length >= 2) trackSignal(req.user!.id, { type: 'search', targetType: 'query', query: q });
  const rawResults = (result.items as any[]).filter((item) => (kind === 'all' || item.kind === kind) && !(item.kind === 'user' && String(item.id) === req.user!.id));
  const blocked = await blockedUserIds(req.user!.id);
  const people = q ? [] : await User.find({ _id: { $nin: [req.user!.id, ...blocked] }, deletedAt: null }).sort({ createdAt: -1 }).limit(24).select(`${AUTHOR_FIELDS} profile.bio`).lean();
  const follows = await Follow.find({ followerId: req.user!.id }).select('followingId').lean();
  const followedIds = new Set(follows.map((row: any) => String(row.followingId)));
  const userIds = q ? rawResults.filter((item) => item.kind === 'user').map((item) => String(item.id)) : people.map((person: any) => String(person._id));
  const friendStates = await getFriendshipStates(req.user!.id, userIds);
  const results = rawResults.map((item) => item.kind === 'user' ? { ...item, friendState: friendStates.get(String(item.id)) || 'none', isFollowing: followedIds.has(String(item.id)) } : item);
  const peopleWithState = people.map((person: any) => ({ ...person, friendState: friendStates.get(String(person._id)) || 'none', isFollowing: followedIds.has(String(person._id)) })).filter((person: any) => person.friendState !== 'friends');
  res.render('search', { ...base(req, 'Search'), q, kind, results, people: peopleWithState });
}

/** Suggestions never break a page: without them the page renders with empty "for you" sections. */
async function recommendationsFor(req: Request, userId: string) {
  try { return await getRecommendations(userId); }
  catch (error) { req.log?.warn({ error }, 'Recommendations unavailable'); return { people: [], groups: [], posts: [], stories: [], interests: [], signalCount: 0, personalized: false }; }
}

export async function discover(req: Request, res: Response) {
  const recommended = await recommendationsFor(req, req.user!.id);
  res.render('discover', { ...base(req, 'For you'), recommended });
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
  const [archive, tray] = await Promise.all([listArchive(req.user!.id), getStoryTray(req.user!.id)]);
  res.render('stories/archive', { ...base(req, 'Story archive'), items: archive.items, next: archive.next, tray, now: Date.now() });
}
