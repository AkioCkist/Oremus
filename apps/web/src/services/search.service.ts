import { Friendship, Group, GroupMember, SearchHistory, SearchTerm, User } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { toneOf } from '../utils/view-helpers.js';
import { blockedUserIds } from './social.service.js';

const HISTORY_LIMIT = 30;
const RECENT_LIMIT = 12;

export type SearchEntry = { id: string; kind: 'query' | 'user' | 'group'; title: string; subtitle: string; url: string; imageUrl: string; tone: string; query?: string; entityId?: string };

export const normalizeQuery = (value: string) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function friendIds(userId: string) {
  const rows = await Friendship.find({ status: 'accepted', $or: [{ userAId: userId }, { userBId: userId }] }).select('userAId userBId').lean();
  return new Set(rows.map((row: any) => String(String(row.userAId) === userId ? row.userBId : row.userAId)));
}

const memberGroupIds = async (userId: string) => (await GroupMember.find({ userId }).select('groupId').lean()).map((row: any) => String(row.groupId));

const userEntry = (user: any, friends: Set<string>, id = String(user._id)): SearchEntry => ({
  id, kind: 'user', entityId: String(user._id), title: user.displayName, subtitle: friends.has(String(user._id)) ? 'Friend' : `@${user.username}`,
  url: `/profile/${user.username}`, imageUrl: user.profile?.avatarUrl || '', tone: toneOf(user.displayName)
});
const groupEntry = (group: any, member: boolean, id = String(group._id)): SearchEntry => ({
  id, kind: 'group', entityId: String(group._id), title: group.name, subtitle: member ? 'Group · Joined' : `${group.privacy === 'private' ? 'Private' : 'Public'} group`,
  url: `/groups/${group.slug}`, imageUrl: group.coverUrl || '', tone: toneOf(group.name)
});

async function trimHistory(userId: string) {
  const stale = await SearchHistory.find({ userId }).sort({ updatedAt: -1 }).skip(HISTORY_LIMIT).select('_id').lean();
  if (stale.length) await SearchHistory.deleteMany({ _id: { $in: stale.map((row: any) => row._id) } });
}

/** Remembers a submitted keyword for the user and counts it towards everyone's completions. */
export async function recordQuery(userId: string, raw: string) {
  const query = normalizeQuery(raw);
  if (query.length < 2) return;
  const term = query.toLowerCase();
  await Promise.all([
    SearchHistory.findOneAndUpdate({ userId, key: `q:${term}` }, { $set: { kind: 'query', query, refId: null } }, { upsert: true, setDefaultsOnInsert: true }),
    SearchTerm.updateOne({ term }, { $inc: { count: 1 } }, { upsert: true })
  ]);
  await trimHistory(userId);
}

/** Remembers a profile or group the user opened from search. */
export async function recordEntity(userId: string, kind: 'user' | 'group', entityId: string) {
  if (kind === 'user') {
    const [user, blocked] = await Promise.all([User.findOne({ _id: entityId, deletedAt: null }).select('_id').lean(), blockedUserIds(userId)]);
    if (!user || blocked.includes(entityId)) throw new AppError(404, 'Profile not found.', 'PROFILE_NOT_FOUND');
  } else {
    const group: any = await Group.findById(entityId).select('visibility').lean();
    if (!group || (group.visibility === 'hidden' && !(await GroupMember.exists({ groupId: entityId, userId })))) throw new AppError(404, 'Group not found.', 'GROUP_NOT_FOUND');
  }
  await SearchHistory.findOneAndUpdate({ userId, key: `${kind}:${entityId}` }, { $set: { kind, refId: entityId, query: '' } }, { upsert: true, setDefaultsOnInsert: true });
  await trimHistory(userId);
}

/** Recent searches with fresh names/photos; deleted, blocked or now-hidden entries are left out. */
export async function listRecent(userId: string): Promise<SearchEntry[]> {
  const rows = await SearchHistory.find({ userId }).sort({ updatedAt: -1 }).limit(HISTORY_LIMIT).lean();
  const userRefs = rows.filter((row: any) => row.kind === 'user').map((row: any) => row.refId);
  const groupRefs = rows.filter((row: any) => row.kind === 'group').map((row: any) => row.refId);
  const [blocked, friends, memberOf, users, groups] = await Promise.all([
    blockedUserIds(userId), friendIds(userId), memberGroupIds(userId),
    userRefs.length ? User.find({ _id: { $in: userRefs }, deletedAt: null }).select('username displayName profile.avatarUrl').lean() : [],
    groupRefs.length ? Group.find({ _id: { $in: groupRefs } }).select('name slug coverUrl privacy visibility').lean() : []
  ]);
  const usersById = new Map(users.filter((user: any) => !blocked.includes(String(user._id))).map((user: any) => [String(user._id), user]));
  const members = new Set(memberOf);
  const groupsById = new Map(groups.filter((group: any) => group.visibility !== 'hidden' || members.has(String(group._id))).map((group: any) => [String(group._id), group]));
  const entries: SearchEntry[] = [];
  for (const row of rows as any[]) {
    const id = String(row._id);
    if (row.kind === 'query') entries.push({ id, kind: 'query', title: row.query, subtitle: '', query: row.query, url: `/search?q=${encodeURIComponent(row.query)}`, imageUrl: '', tone: '' });
    else if (row.kind === 'user' && usersById.has(String(row.refId))) entries.push(userEntry(usersById.get(String(row.refId)), friends, id));
    else if (row.kind === 'group' && groupsById.has(String(row.refId))) entries.push(groupEntry(groupsById.get(String(row.refId)), members.has(String(row.refId)), id));
    if (entries.length >= RECENT_LIMIT) break;
  }
  return entries;
}

export async function removeRecent(userId: string, entryId?: string) {
  if (entryId) { if (/^[a-f0-9]{24}$/i.test(entryId)) await SearchHistory.deleteOne({ _id: entryId, userId }); }
  else await SearchHistory.deleteMany({ userId });
}

/**
 * Typeahead for the header search: keyword completions (your past searches first, then what
 * people search most), matching profiles (friends first) and groups (joined first).
 */
export async function suggest(userId: string, raw: string) {
  const query = normalizeQuery(raw);
  if (!query) return { query, completions: [], users: [], groups: [] };
  const prefix = new RegExp(`^${escapeRegex(query)}`, 'i');
  const wordStart = new RegExp(`(^|\\s)${escapeRegex(query)}`, 'i');
  const [blocked, friends, memberOf] = await Promise.all([blockedUserIds(userId), friendIds(userId), memberGroupIds(userId)]);
  const [history, terms, users, groups] = await Promise.all([
    SearchHistory.find({ userId, kind: 'query', query: prefix }).sort({ updatedAt: -1 }).limit(4).select('query').lean(),
    SearchTerm.find({ term: prefix }).sort({ count: -1 }).limit(8).select('term').lean(),
    User.find({ _id: { $nin: [userId, ...blocked] }, deletedAt: null, $or: [{ displayName: wordStart }, { username: prefix }] }).limit(25).select('username displayName profile.avatarUrl').lean(),
    Group.find({ name: wordStart, $or: [{ visibility: { $ne: 'hidden' } }, { _id: { $in: memberOf } }] }).limit(15).select('name slug coverUrl privacy visibility').lean()
  ]);
  const members = new Set(memberOf);
  const rank = (name: string, preferred: boolean) => (preferred ? 0 : 2) + (prefix.test(name) ? 0 : 1);
  const rankedUsers = users.sort((a: any, b: any) => rank(a.displayName, friends.has(String(a._id))) - rank(b.displayName, friends.has(String(b._id))) || a.displayName.localeCompare(b.displayName)).slice(0, 5);
  const rankedGroups = groups.sort((a: any, b: any) => rank(a.name, members.has(String(a._id))) - rank(b.name, members.has(String(b._id))) || a.name.localeCompare(b.name)).slice(0, 3);

  const seen = new Set([query.toLowerCase()]);
  const completions: Array<{ text: string; recent: boolean }> = [];
  const add = (text: string, recent: boolean) => {
    const key = text.toLowerCase();
    if (completions.length < 5 && !seen.has(key) && prefix.test(text)) { seen.add(key); completions.push({ text, recent }); }
  };
  history.forEach((row: any) => add(row.query, true));
  terms.forEach((row: any) => add(row.term, false));
  // Names that start with what was typed are useful completions too ("ngu" → "nguyễn tuấn").
  [...rankedUsers.map((user: any) => user.displayName), ...rankedGroups.map((group: any) => group.name)].forEach((name) => add(name.toLowerCase(), false));

  return { query, completions, users: rankedUsers.map((user: any) => userEntry(user, friends)), groups: rankedGroups.map((group: any) => groupEntry(group, members.has(String(group._id)))) };
}
