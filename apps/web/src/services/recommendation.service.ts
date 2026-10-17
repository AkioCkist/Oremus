import mongoose from 'mongoose';
import { Comment, Follow, Friendship, Group, GroupJoinRequest, GroupMember, Post, Reaction, Story, StoryView, User } from '../models/index.js';
import { groupText, postText, storyText, userText } from '../recommender/documents.js';
import { declaredSignals } from '../recommender/interests.js';
import { interestOption } from '../shared/interests.js';
import { buildProfile, computeIdf, decay, diversify, rankDocuments, topInterests, type Candidate, type Interest, type Profile, type Reason } from '../recommender/engine.js';
import { analyze, type Vector } from '../recommender/text.js';
import { plural } from '../utils/view-helpers.js';
import { loadSignals, recommendationCacheKey } from './activity.service.js';
import { cacheGet, cacheSet } from './cache.service.js';
import { getFriendshipStates, listFriendIds } from './friendship.service.js';
import { feedExclusions } from './social.service.js';

/**
 * "Suggested for you": people, posts, groups and stories ranked by the recommender (src/recommender)
 * against the viewer's interest profile, which is built from what they search, read, open and engage with.
 *
 * Everything that can be suggested (the corpus) is public content, vectorised once and shared by every
 * viewer for CORPUS_TTL_MS; per-viewer filtering (blocks, people you already follow, groups you joined,
 * posts you already saw) happens on each request. Results are cached per viewer and dropped as soon as
 * a new signal is recorded, so the page reacts to what you just did.
 */

const DAY = 86_400_000;
const CORPUS_TTL_MS = 60_000;
const CACHE_TTL_SECONDS = 120;
const POST_WINDOW_DAYS = 120;
const LIMITS = { people: 8, groups: 6, posts: 8, stories: 8 };
const AUTHOR_FIELDS = 'username displayName profile.avatarUrl profile.bio profile.about profile.hobbies profile.work profile.education profile.location profile.audience profile.introHidden profile.privacy createdAt';

type UserDoc = Candidate & { kind: 'user'; user: any; postCount: number; createdAt: Date };
type GroupDoc = Candidate & { kind: 'group'; group: any };
type PostDoc = Candidate & { kind: 'post'; post: any; engagement: number; createdAt: Date };
type StoryDoc = Candidate & { kind: 'story'; story: any; viewCount: number; createdAt: Date };
type Corpus = { idf: Map<string, number>; users: UserDoc[]; groups: GroupDoc[]; posts: PostDoc[]; stories: StoryDoc[]; usersById: Map<string, any>; groupsById: Map<string, any> };

export type RecPerson = { _id: string; username: string; displayName: string; profile: { avatarUrl: string; bio: string }; reason: Reason; score: number; similarity: number; mutualFriends: number; friendState: string; isFollowing: boolean };
export type RecGroup = { _id: string; name: string; slug: string; coverUrl: string; privacy: string; memberCount: number; tags: string[]; description: string; reason: Reason; score: number; friendsInGroup: number; pending: boolean };
export type RecPost = { _id: string; content: string; media: { url: string; video: boolean } | null; mediaCount: number; author: { _id: string; username: string; displayName: string; avatarUrl: string }; group: { name: string; slug: string } | null; reactionCount: number; commentCount: number; createdAt: Date; reason: Reason; score: number };
export type RecStory = { id: string; author: { _id: string; username: string; displayName: string; avatarUrl: string }; story: { mediaUrl: string | null; mediaType: 'image' | 'video' | null; text: string; style: unknown; background: string }; createdAt: Date; seen: boolean; reason: Reason; score: number };
/** `declared` echoes the onboarding survey answers; `interests` is what the model learned from them plus behaviour. */
export type Recommendations = { people: RecPerson[]; groups: RecGroup[]; posts: RecPost[]; stories: RecStory[]; interests: Interest[]; declared: { topics: string[]; keywords: string[] }; signalCount: number; personalized: boolean };

/* ---------- Corpus ---------- */

let corpusCache: { at: number; value: Promise<Corpus> } | null = null;

/** Forget the shared corpus (tests, or after bulk changes such as seeding). */
export function resetCorpus() { corpusCache = null; }

const relativeLog = (values: number[]) => {
  const max = Math.log1p(Math.max(0, ...values));
  return (value: number) => (max ? Math.log1p(value) / max : 0);
};
const idOf = (value: any) => String(value?._id ?? value ?? '');
const hasFeatures = (vector: Vector) => vector.size > 0;

async function buildCorpus(): Promise<Corpus> {
  const now = Date.now();
  const groups: any[] = await Group.find({ visibility: { $ne: 'hidden' } }).select('name slug description coverUrl privacy groupType location tags memberCount createdAt').lean();
  const publicGroupIds = groups.filter((group) => group.privacy === 'public').map((group) => group._id);
  const [users, posts, stories]: [any[], any[], any[]] = await Promise.all([
    User.find({ deletedAt: null }).select(AUTHOR_FIELDS).limit(5000).lean(),
    Post.find({ deletedAt: null, groupStatus: 'approved', createdAt: { $gte: new Date(now - POST_WINDOW_DAYS * DAY) }, $or: [{ groupId: null, visibility: 'public' }, { groupId: { $in: publicGroupIds } }] })
      .sort({ createdAt: -1 }).limit(3000).select('authorId groupId sharedPostId content media place feeling reactionCount commentCount shareCount createdAt').lean(),
    Story.find({ deletedAt: null, audience: 'public', expiresAt: { $gt: new Date(now) } }).sort({ createdAt: -1 }).limit(800).select('authorId media text background style viewCount createdAt').lean()
  ]);
  const usersById = new Map(users.map((user) => [idOf(user), user]));
  const groupsById = new Map(groups.map((group) => [idOf(group), group]));

  const textsBy = (key: 'authorId' | 'groupId') => {
    const map = new Map<string, string[]>();
    for (const post of posts) {
      const id = post[key] ? idOf(post[key]) : '';
      if (!id || !post.content) continue;
      if (key === 'authorId' && post.groupId) continue; // a profile is described by its own timeline
      const list = map.get(id) || [];
      if (list.length < 10) { list.push(post.content); map.set(id, list); }
    }
    return map;
  };
  const byAuthor = textsBy('authorId');
  const byGroup = textsBy('groupId');

  const userDocs: UserDoc[] = users.map((user) => ({ kind: 'user' as const, id: idOf(user), vector: analyze(userText(user, byAuthor.get(idOf(user)) || [])).vector, authorId: idOf(user), user, postCount: (byAuthor.get(idOf(user)) || []).length, createdAt: user.createdAt }));
  const groupDocs: GroupDoc[] = groups.map((group) => ({ kind: 'group' as const, id: idOf(group), vector: analyze(groupText(group, byGroup.get(idOf(group)) || [])).vector, groupId: idOf(group), group }));
  // Shares point at content shown elsewhere; suggest originals only.
  const postDocs: PostDoc[] = posts.filter((post) => !post.sharedPostId).map((post) => ({
    kind: 'post' as const, id: idOf(post), vector: analyze(postText(post, post.groupId ? groupsById.get(idOf(post.groupId)) : null)).vector,
    authorId: idOf(post.authorId), groupId: post.groupId ? idOf(post.groupId) : null, post,
    engagement: (post.reactionCount || 0) + 2 * (post.commentCount || 0) + 3 * (post.shareCount || 0), createdAt: post.createdAt
  })).filter((doc) => hasFeatures(doc.vector));
  const storyDocs: StoryDoc[] = stories.filter((story) => usersById.has(idOf(story.authorId))).map((story) => ({
    kind: 'story' as const, id: idOf(story), vector: analyze(storyText(story, usersById.get(idOf(story.authorId)))).vector,
    authorId: idOf(story.authorId), story, viewCount: story.viewCount || 0, createdAt: story.createdAt
  }));

  const idf = computeIdf([...userDocs, ...groupDocs, ...postDocs, ...storyDocs].map((doc) => doc.vector));
  return { idf, users: userDocs, groups: groupDocs, posts: postDocs, stories: storyDocs, usersById, groupsById };
}

function loadCorpus(): Promise<Corpus> {
  if (!corpusCache || Date.now() - corpusCache.at > CORPUS_TTL_MS) {
    const value = buildCorpus();
    corpusCache = { at: Date.now(), value };
    value.catch(() => { if (corpusCache?.value === value) corpusCache = null; });
  }
  return corpusCache.value;
}

/* ---------- Viewer context ---------- */

/** For each candidate: how many of my friends are also their friends (one query over friends-of-friends). */
async function mutualCounts(userId: string, friendIds: string[]) {
  const counts = new Map<string, number>();
  if (!friendIds.length) return counts;
  const rows: any[] = await Friendship.find({ status: 'accepted', $or: [{ userAId: { $in: friendIds } }, { userBId: { $in: friendIds } }] }).select('userAId userBId').lean();
  const mine = new Set(friendIds);
  for (const row of rows) {
    const [a, b] = [String(row.userAId), String(row.userBId)];
    if (mine.has(a) && b !== userId) counts.set(b, (counts.get(b) || 0) + 1);
    if (mine.has(b) && a !== userId) counts.set(a, (counts.get(a) || 0) + 1);
  }
  return counts;
}

async function friendsPerGroup(friendIds: string[]) {
  if (!friendIds.length) return new Map<string, number>();
  const rows = await GroupMember.aggregate([
    { $match: { userId: { $in: friendIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $group: { _id: '$groupId', count: { $sum: 1 } } }
  ]);
  return new Map(rows.map((row: any) => [String(row._id), row.count as number]));
}

const personOf = (user: any) => ({ _id: idOf(user), username: user.username, displayName: user.displayName, avatarUrl: user.profile?.avatarUrl || '' });

/* ---------- Ranking per kind ---------- */

function rankPeople(corpus: Corpus, profile: Profile, userId: string, skip: Set<string>, mutual: Map<string, number>) {
  const activity = relativeLog(corpus.users.map((doc) => doc.postCount));
  const now = Date.now();
  const candidates = corpus.users.filter((doc) => doc.id !== userId && !skip.has(doc.id)).map((doc) => {
    const count = mutual.get(doc.id) || 0;
    return { ...doc, social: Math.min(count / 5, 1), popularity: activity(doc.postCount), freshness: now - new Date(doc.createdAt).getTime() < 14 * DAY ? 1 : 0,
      penalty: profile.seen.user.has(doc.id) ? 0.3 : 0, socialReason: count ? plural(count, 'mutual friend') : '' };
  });
  return rankDocuments(candidates, profile, corpus.idf, (doc) => doc.socialReason ? { code: 'social', text: doc.socialReason }
    : doc.freshness ? { code: 'new', text: 'New on Oremus' } : (doc.popularity || 0) > 0.5 ? { code: 'popular', text: 'Active on Oremus' } : { code: 'popular', text: 'Suggested for you' })
    .slice(0, LIMITS.people);
}

function rankGroups(corpus: Corpus, profile: Profile, joined: Set<string>, friendsIn: Map<string, number>) {
  const size = relativeLog(corpus.groups.map((doc) => doc.group.memberCount || 0));
  const candidates = corpus.groups.filter((doc) => !joined.has(doc.id)).map((doc) => {
    const friends = friendsIn.get(doc.id) || 0;
    return { ...doc, social: Math.min(friends / 3, 1), popularity: size(doc.group.memberCount || 0), socialReason: friends ? `${plural(friends, 'friend')} ${friends === 1 ? 'is a member' : 'are members'}` : '' };
  });
  return rankDocuments(candidates, profile, corpus.idf, (doc) => doc.socialReason ? { code: 'social', text: doc.socialReason } : { code: 'popular', text: `Popular group · ${plural(doc.group.memberCount || 0, 'member')}` })
    .slice(0, LIMITS.groups);
}

function rankPosts(corpus: Corpus, profile: Profile, userId: string, hiddenAuthors: Set<string>, joined: Set<string>, seen: Set<string>) {
  const engagement = relativeLog(corpus.posts.map((doc) => doc.engagement));
  const now = Date.now();
  const candidates = corpus.posts.filter((doc) => doc.authorId !== userId && !hiddenAuthors.has(String(doc.authorId)) && !(doc.groupId && joined.has(doc.groupId)) && !seen.has(doc.id))
    .map((doc) => ({ ...doc, popularity: engagement(doc.engagement), freshness: decay(now - new Date(doc.createdAt).getTime(), 3) }));
  const ranked = rankDocuments(candidates, profile, corpus.idf, (doc) => (doc.popularity || 0) > 0.6 ? { code: 'popular', text: 'Popular on Oremus' } : { code: 'new', text: 'Recent post you might like' });
  return diversify(ranked, (doc) => String(doc.authorId), 2, LIMITS.posts);
}

function rankStories(corpus: Corpus, profile: Profile, userId: string, hiddenAuthors: Set<string>, viewed: Set<string>) {
  const views = relativeLog(corpus.stories.map((doc) => doc.viewCount));
  const now = Date.now();
  const candidates = corpus.stories.filter((doc) => doc.authorId !== userId && !hiddenAuthors.has(String(doc.authorId)))
    .map((doc) => ({ ...doc, popularity: views(doc.viewCount), freshness: Math.max(0, 1 - (now - new Date(doc.createdAt).getTime()) / DAY), penalty: viewed.has(doc.id) ? 1 : 0 }));
  const ranked = rankDocuments(candidates, profile, corpus.idf, () => ({ code: 'new', text: 'Public story' }));
  return diversify(ranked, (doc) => String(doc.authorId), 1, LIMITS.stories);
}

/* ---------- Public API ---------- */

export async function getRecommendations(userId: string): Promise<Recommendations> {
  const key = recommendationCacheKey(userId);
  const cached = await cacheGet<Recommendations>(key);
  if (cached) return cached;

  const [corpus, signals, excluded, follows, friendIds, memberships, reactions, comments, viewer] = await Promise.all([
    loadCorpus(), loadSignals(userId), feedExclusions(userId),
    Follow.find({ followerId: userId }).select('followingId').lean(), listFriendIds(userId),
    GroupMember.find({ userId }).select('groupId').lean(),
    Reaction.find({ userId }).sort({ createdAt: -1 }).limit(1000).select('postId').lean(),
    Comment.find({ authorId: userId, deletedAt: null }).sort({ createdAt: -1 }).limit(1000).select('postId').lean(),
    User.findById(userId).select('interests').lean()
  ]);
  const declared: any = (viewer as any)?.interests || {};
  // Survey answers and recorded behaviour share one profile; the survey's weight fades as behaviour builds up.
  const profile = buildProfile([...signals, ...declaredSignals(declared)]);
  const following = new Set(follows.map((row: any) => String(row.followingId)));
  const friends = new Set(friendIds);
  const excludedSet = new Set(excluded);
  const joined = new Set(memberships.map((row: any) => String(row.groupId)));
  const seenPosts = new Set([...profile.seen.post, ...reactions.map((row: any) => String(row.postId)), ...comments.map((row: any) => String(row.postId))]);
  const hiddenAuthors = new Set([...excludedSet, ...following]);

  const [mutual, friendsIn] = await Promise.all([mutualCounts(userId, friendIds), friendsPerGroup(friendIds)]);
  const people = rankPeople(corpus, profile, userId, new Set([...excludedSet, ...friends, ...following]), mutual);
  const groups = rankGroups(corpus, profile, joined, friendsIn);
  const posts = rankPosts(corpus, profile, userId, hiddenAuthors, joined, seenPosts);
  const storyPool = corpus.stories.filter((doc) => doc.authorId !== userId).map((doc) => doc.id);
  const viewedRows = storyPool.length ? await StoryView.find({ viewerId: userId, storyId: { $in: storyPool } }).select('storyId').lean() : [];
  const stories = rankStories(corpus, profile, userId, hiddenAuthors, new Set(viewedRows.map((row: any) => String(row.storyId))));

  const [friendStates, pendingJoins] = await Promise.all([
    getFriendshipStates(userId, people.map((doc) => doc.id)),
    groups.length ? GroupJoinRequest.find({ userId, status: 'pending', groupId: { $in: groups.map((doc) => doc.id) } }).select('groupId').lean() : []
  ]);
  const pending = new Set(pendingJoins.map((row: any) => String(row.groupId)));

  const result: Recommendations = {
    people: people.map((doc) => ({
      _id: doc.id, username: doc.user.username, displayName: doc.user.displayName, profile: { avatarUrl: doc.user.profile?.avatarUrl || '', bio: doc.user.profile?.bio || '' },
      reason: doc.reason, score: doc.score, similarity: doc.similarity, mutualFriends: mutual.get(doc.id) || 0, friendState: friendStates.get(doc.id) || 'none', isFollowing: false
    })),
    groups: groups.map((doc) => ({
      _id: doc.id, name: doc.group.name, slug: doc.group.slug, coverUrl: doc.group.coverUrl || '', privacy: doc.group.privacy, memberCount: doc.group.memberCount || 0,
      tags: doc.group.tags || [], description: doc.group.description || '', reason: doc.reason, score: doc.score, friendsInGroup: friendsIn.get(doc.id) || 0, pending: pending.has(doc.id)
    })),
    posts: posts.filter((doc) => corpus.usersById.has(String(doc.authorId))).map((doc) => {
      const first = (doc.post.media || [])[0];
      const video = !!first && String(first.mimeType).startsWith('video/');
      const group = doc.groupId ? corpus.groupsById.get(doc.groupId) : null;
      return {
        _id: doc.id, content: String(doc.post.content || '').slice(0, 280), media: first ? { url: video ? first.poster || '' : first.url, video } : null, mediaCount: (doc.post.media || []).length,
        author: personOf(corpus.usersById.get(String(doc.authorId))), group: group ? { name: group.name, slug: group.slug } : null,
        reactionCount: doc.post.reactionCount || 0, commentCount: doc.post.commentCount || 0, createdAt: doc.createdAt, reason: doc.reason, score: doc.score
      };
    }),
    stories: stories.map((doc) => ({
      id: doc.id, author: personOf(corpus.usersById.get(String(doc.authorId))), createdAt: doc.createdAt, seen: !!doc.penalty, reason: doc.reason, score: doc.score,
      story: {
        mediaUrl: doc.story.media?.url || null, mediaType: doc.story.media ? (String(doc.story.media.mimeType).startsWith('video/') ? 'video' : 'image') : null,
        text: doc.story.text || '', style: doc.story.style || null, background: doc.story.background || 'ocean'
      }
    })),
    interests: topInterests(profile, 10),
    declared: { topics: (declared.completedAt ? declared.topics || [] : []).map((key: string) => interestOption(key)?.label).filter(Boolean), keywords: declared.completedAt ? declared.keywords || [] : [] },
    signalCount: profile.signalCount,
    personalized: profile.terms.size > 0
  };
  await cacheSet(key, result, CACHE_TTL_SECONDS);
  return result;
}
