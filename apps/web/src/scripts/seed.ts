import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectInfrastructure, disconnectInfrastructure } from '../config/database.js';
import {
  Comment, Conversation, Follow, Friendship, Group, GroupInvite, GroupJoinRequest, GroupMember, GroupPost, Interaction, Message, Notification,
  Post, Reaction, Story, StoryView, User, STORY_TTL_MS
} from '../models/index.js';
import { groupText, postText, queryText, userText } from '../recommender/documents.js';
import { analyze, topFeatures } from '../recommender/text.js';
import { invalidateByPrefix, invalidateFeedCaches } from '../services/cache.service.js';
import { CHATS, COMMENTS, DEMO_ACCOUNT, EXTRA_FOLLOWS, FRIENDS, GROUPS, PENDING_REQUESTS, PEOPLE, POSTS, REPLIES, SEED_PASSWORD, SIGNALS, STORIES, type SeedPhoto, type SeedSignal } from './seed-data.js';
import { avatar, isServedBy, photo, prepareSeedImages, type SeedImageRequest } from './seed-media.js';
import { env } from '../config/env.js';

/**
 * `npm run seed`: fills the app with 38 sample people (full profiles, real photos), 17 groups, ~140 posts with reactions
 * and comment threads, ~36 stories, chats and notifications, so every page looks like a lived-in social network.
 * Half of the people have one clear subject each (AI, coffee, gaming, books, running…) for testing recommendations,
 * and two accounts (mai@, olivia@) get a short behaviour history so their "For you" page is already personalised.
 *
 * Safe to re-run: sample users keep their ids (so open sessions survive), everything they created is rebuilt
 * relative to "now" (stories stay inside the 24-hour window). Content made by other accounts is left alone.
 * All randomness is seeded, so every run produces the same data.
 */

const { ObjectId } = mongoose.Types;
type Id = mongoose.Types.ObjectId;

const HOUR = 3_600_000;
const MINUTE = 60_000;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);

/* ---------- Deterministic randomness ---------- */

function rng(seed: string) {
  let state = [...seed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = <T>(items: T[], random: () => number) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j]!, copy[i]!]; }
  return copy;
};
const pick = <T>(items: T[], random: () => number) => items[Math.floor(random() * items.length)]!;
const REACTION_WEIGHTS: Array<[string, number]> = [['like', 0.5], ['love', 0.28], ['haha', 0.1], ['wow', 0.08], ['sad', 0.04]];
const reactionType = (random: () => number) => {
  let roll = random();
  for (const [type, weight] of REACTION_WEIGHTS) { if ((roll -= weight) < 0) return type; }
  return 'like';
};

/* ---------- Images ---------- */

const photoRequest = (value: SeedPhoto) => (Array.isArray(value) ? photo(value[0], value[1], value[2]) : photo(value));
const coverRequest = (id: number) => photo(id, 1600, 600);
const storyRequest = (id: number) => photo(id, 1080, 1920);

function imageRequests(): SeedImageRequest[] {
  return [
    ...PEOPLE.flatMap((person) => [avatar(person.avatar), coverRequest(person.cover)]),
    ...GROUPS.map((group) => coverRequest(group.cover)),
    ...POSTS.flatMap((post) => (post.photos || []).map(photoRequest)),
    ...STORIES.filter((story) => story.photo).map((story) => storyRequest(story.photo!))
  ];
}

/* ---------- Seed ---------- */

async function seed() {
  await connectInfrastructure();

  console.log('Preparing photos (downloaded once, then reused from uploads/)…');
  const url = await prepareSeedImages(imageRequests());

  // 1. People: upsert by e-mail so ids (and open sessions) stay stable across runs.
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const ids = new Map<string, Id>();
  for (const [index, person] of PEOPLE.entries()) {
    const avatarUrl = url(avatar(person.avatar));
    const coverUrl = url(coverRequest(person.cover));
    const joined = ago((60 + index * 37) * 24 * HOUR);
    const user = await User.findOneAndUpdate({ email: person.email }, {
      $set: {
        username: person.key, displayName: person.displayName, passwordHash, deletedAt: null, lastSeenAt: ago((index % 7) * 13 * MINUTE),
        profile: { privacy: 'public', ...person.profile, avatarUrl, coverUrl, avatarHistory: avatarUrl ? [avatarUrl] : [], coverHistory: [coverUrl] },
        createdAt: joined, updatedAt: joined
      }
    }, { upsert: true, new: true, timestamps: false });
    ids.set(person.key, user._id);
  }
  const id = (key: string) => { const value = ids.get(key); if (!value) throw new Error(`Unknown seed person "${key}"`); return value; };
  const seedIds = [...ids.values()];
  // Friendships store each pair once, sorted by id (see friendship.service.ts).
  const pair = (a: string, b: string) => { const [userAId, userBId] = [String(id(a)), String(id(b))].sort(); return { userAId: new ObjectId(userAId), userBId: new ObjectId(userBId) }; };
  console.log(`People: ${seedIds.length}`);

  // 2. Groups keep their ids too; only sample members are rebuilt.
  const groupIds = new Map<string, Id>();
  for (const group of GROUPS) {
    const owner = group.members.find(([, role]) => role === 'admin')![0];
    const doc = await Group.findOneAndUpdate({ slug: group.slug }, {
      $set: {
        name: group.name, description: group.description, coverUrl: url(coverRequest(group.cover)), privacy: group.privacy, visibility: 'visible',
        groupType: group.groupType, location: group.location, tags: group.tags, rules: group.rules, questions: group.questions || [],
        settings: { whoCanPost: 'anyone', postApproval: !!group.postApproval, whoCanApprove: 'admins' }, ownerId: id(owner)
      }
    }, { upsert: true, new: true });
    groupIds.set(group.slug, doc._id);
  }
  const allGroupIds = [...groupIds.values()];

  await removePreviousSample(seedIds, allGroupIds);

  // 3. Social graph.
  const friendsOf = new Map<string, Set<string>>(PEOPLE.map((person) => [person.key, new Set()]));
  const followerOf = new Map<string, Set<string>>(PEOPLE.map((person) => [person.key, new Set()]));
  const follows: Array<[string, string, Date]> = [];
  const friendships: Record<string, unknown>[] = [];
  const notifications: Record<string, unknown>[] = [];
  const notify = (recipient: string, actor: string, type: string, entityType: string, entityId: Id, text: string, at: Date) => {
    if (recipient === actor) return;
    notifications.push({ recipientId: id(recipient), actorId: id(actor), type, entityType, entityId, text, createdAt: at, updatedAt: at, readAt: now - at.getTime() > 12 * HOUR ? at : null });
  };

  FRIENDS.forEach(([a, b], index) => {
    const random = rng(`friend:${a}:${b}`);
    const acceptedAt = ago((2 + index * 9 + random() * 24) * HOUR);
    const _id = new ObjectId();
    friendships.push({ _id, ...pair(a, b), requesterId: id(a), status: 'accepted', acceptedAt, createdAt: new Date(acceptedAt.getTime() - 6 * HOUR), updatedAt: acceptedAt });
    friendsOf.get(a)!.add(b); friendsOf.get(b)!.add(a);
    follows.push([a, b, acceptedAt], [b, a, acceptedAt]);
    if (now - acceptedAt.getTime() < 14 * 24 * HOUR) notify(a, b, 'friend_accept', 'Friendship', _id, 'accepted your friend request', acceptedAt);
  });
  PENDING_REQUESTS.forEach(([from, to], index) => {
    const at = ago((3 + index * 5) * HOUR);
    const _id = new ObjectId();
    friendships.push({ _id, ...pair(from, to), requesterId: id(from), status: 'pending', acceptedAt: null, createdAt: at, updatedAt: at });
    notify(to, from, 'friend_request', 'Friendship', _id, 'sent you a friend request', at);
  });
  EXTRA_FOLLOWS.forEach(([from, to], index) => {
    const at = ago((5 + index * 11) * HOUR);
    follows.push([from, to, at]);
    notify(to, from, 'follow', 'User', id(from), 'started following you', at);
  });
  const followRows = [...new Map(follows.map(([from, to, at]) => [`${from}>${to}`, { followerId: id(from), followingId: id(to), createdAt: at, updatedAt: at }])).values()];
  follows.forEach(([from, to]) => followerOf.get(to)!.add(from));
  await Follow.insertMany(followRows);
  await Friendship.insertMany(friendships);
  console.log(`Follows: ${followRows.length}, friendships: ${FRIENDS.length} (+${PENDING_REQUESTS.length} pending)`);

  // 4. Group members.
  const membersOf = new Map<string, Set<string>>();
  for (const group of GROUPS) {
    const groupId = groupIds.get(group.slug)!;
    membersOf.set(group.slug, new Set(group.members.map(([key]) => key)));
    await GroupMember.insertMany(group.members.map(([key, role], index) => {
      const at = ago((200 - index * 9) * 24 * HOUR);
      return { groupId, userId: id(key), role, createdAt: at, updatedAt: at };
    }));
    await Group.updateOne({ _id: groupId }, { memberCount: await GroupMember.countDocuments({ groupId }) });
  }
  const photoGroup = GROUPS.find((group) => group.questions?.length);
  if (photoGroup) {
    const at = ago(5 * HOUR);
    const groupId = groupIds.get(photoGroup.slug)!;
    await GroupJoinRequest.create({ groupId, userId: id('quangvo'), status: 'pending', agreedToRules: true, answers: [{ question: photoGroup.questions![0], answer: 'An old Fujifilm X100 and my phone.' }, { question: photoGroup.questions![1], answer: 'Hà Nội Old Quarter at 5am.' }], createdAt: at, updatedAt: at });
    notify(photoGroup.members[0]![0], 'quangvo', 'group_request', 'Group', groupId, `requested to join ${photoGroup.name}`, at);
  }

  // 5. Posts.
  const postIds = new Map<string, Id>();
  const postRows = POSTS.map((post) => {
    const _id = new ObjectId();
    postIds.set(post.key, _id);
    const createdAt = ago(post.hoursAgo * HOUR);
    return {
      _id, seedKey: post.key, authorId: id(post.author), groupId: post.group ? groupIds.get(post.group)! : null, content: post.text,
      media: (post.photos || []).map((value) => ({ _id: new ObjectId(), url: url(photoRequest(value)), mimeType: 'image/webp', alt: '', status: 'ready', poster: '' })),
      visibility: post.visibility || 'public', feeling: post.feeling ? { text: '', ...post.feeling } : null, place: post.place ? { id: `seed:${post.key}`, ...post.place } : null,
      groupStatus: 'approved', reactionCount: 0, commentCount: 0, deletedAt: null, createdAt, updatedAt: createdAt
    };
  });
  await Post.insertMany(postRows);
  await GroupPost.insertMany(POSTS.filter((post) => post.group).map((post) => {
    const at = ago(post.hoursAgo * HOUR);
    return { groupId: groupIds.get(post.group!)!, postId: postIds.get(post.key)!, authorId: id(post.author), createdAt: at, updatedAt: at };
  }));

  // 6. Reactions and comment threads: from the author's friends first, limited to who could actually see the post.
  const reactions: Record<string, unknown>[] = [];
  const comments: Record<string, unknown>[] = [];
  for (const post of POSTS) {
    const random = rng(`post:${post.key}`);
    const postId = postIds.get(post.key)!;
    const posted = now - post.hoursAgo * HOUR;
    const window = Math.min(post.hoursAgo * HOUR - 5 * MINUTE, 30 * HOUR);
    const at = () => new Date(posted + 5 * MINUTE + random() * Math.max(window, MINUTE));
    const audience = PEOPLE.map((person) => person.key).filter((key) => key !== post.author)
      .filter((key) => !post.group || membersOf.get(post.group)!.has(key))
      .filter((key) => post.visibility !== 'followers' || followerOf.get(post.author)!.has(key));
    const close = friendsOf.get(post.author)!;
    const ranked = [...shuffle(audience.filter((key) => close.has(key)), random), ...shuffle(audience.filter((key) => !close.has(key)), random)];

    const popularity = (post.photos?.length ? 0.55 : 0.35) + random() * 0.4;
    for (const key of ranked.slice(0, Math.max(2, Math.round(ranked.length * popularity)))) {
      const type = reactionType(random);
      const when = at();
      reactions.push({ userId: id(key), postId, type, createdAt: when, updatedAt: when });
      notify(post.author, key, 'reaction', 'Post', postId, `reacted ${type} to your post`, when);
    }

    const thread: Array<[string, string, string?]> = [...(post.comments || [])];
    const used = new Set(thread.map(([key]) => key));
    const extra = Math.floor(random() * 4);
    for (const key of ranked.filter((candidate) => !used.has(candidate)).slice(0, extra)) {
      thread.push([key, pick([...COMMENTS[post.topic], ...COMMENTS.general], random), random() < 0.35 ? pick(REPLIES, random) : undefined]);
    }
    const times = thread.map(() => at()).sort((x, y) => x.getTime() - y.getTime());
    thread.forEach(([key, text, reply], index) => {
      if (!audience.includes(key)) return;
      const _id = new ObjectId();
      const when = times[index]!;
      comments.push({ _id, postId, authorId: id(key), parentId: null, content: text, deletedAt: null, createdAt: when, updatedAt: when });
      notify(post.author, key, 'comment', 'Post', postId, 'commented on your post', when);
      if (reply) {
        const replyAt = new Date(Math.min(now - MINUTE, when.getTime() + (10 + random() * 120) * MINUTE));
        comments.push({ postId, authorId: id(post.author), parentId: _id, content: reply, deletedAt: null, createdAt: replyAt, updatedAt: replyAt });
      }
    });
  }
  await Reaction.insertMany(reactions);
  await Comment.insertMany(comments);
  await recountPosts([...postIds.values()]);
  console.log(`Posts: ${POSTS.length} (${postRows.reduce((sum, post) => sum + post.media.length, 0)} photos), reactions: ${reactions.length}, comments: ${comments.length}`);

  // 7. Stories (always inside the last 24 hours) with views and a few reactions.
  const storyViews: Record<string, unknown>[] = [];
  for (const [index, story] of STORIES.entries()) {
    const random = rng(`story:${index}`);
    const createdAt = ago(story.minutesAgo * MINUTE);
    const person = PEOPLE.find((candidate) => candidate.key === story.author)!;
    const audience = String(person.profile.storyAudience) === 'public' ? PEOPLE.map((p) => p.key) : [...followerOf.get(story.author)!];
    const viewers = shuffle(audience.filter((key) => key !== story.author), random).slice(0, 3 + Math.floor(random() * 9));
    const doc = await Story.create({
      seedKey: `story-${index}`, authorId: id(story.author), media: story.photo ? { url: url(storyRequest(story.photo)), mimeType: 'image/webp' } : null,
      text: story.text || '', background: story.background || 'ocean', style: story.text ? { ...story.style } : null,
      audience: String(person.profile.storyAudience) === 'public' ? 'public' : 'followers', viewCount: viewers.length, deletedAt: null,
      createdAt, updatedAt: createdAt, expiresAt: new Date(createdAt.getTime() + STORY_TTL_MS)
    });
    for (const key of viewers) {
      const seen = new Date(Math.min(now - MINUTE, createdAt.getTime() + random() * story.minutesAgo * MINUTE));
      const reaction = random() < 0.25 ? pick(['love', 'haha', 'like'], random) : null;
      storyViews.push({ storyId: doc._id, viewerId: id(key), reaction, createdAt: seen, updatedAt: seen });
      if (reaction) notify(story.author, key, 'story_reaction', 'Story', doc._id, `reacted ${reaction} to your story`, seen);
    }
  }
  await StoryView.insertMany(storyViews);
  console.log(`Stories: ${STORIES.length}, story views: ${storyViews.length}`);

  // 8. Conversations. Messages from the last hour stay unread so the inbox shows badges.
  let messageCount = 0;
  for (const chat of CHATS) {
    const members = chat.members.map(id);
    const last = Math.min(...chat.messages.map(([, , minutes]) => minutes));
    const conversation = await Conversation.create({ memberIds: members, lastMessageAt: ago(last * MINUTE), createdAt: ago(Math.max(...chat.messages.map(([, , minutes]) => minutes)) * MINUTE) });
    await Message.insertMany(chat.messages.map(([from, content, minutes]) => {
      const at = ago(minutes * MINUTE);
      const readBy = minutes > 60 ? members : [members[from]];
      return { conversationId: conversation._id, senderId: members[from], content, readBy, deletedAt: null, createdAt: at, updatedAt: at };
    }));
    messageCount += chat.messages.length;
    const [from, , minutes] = chat.messages.find(([, , value]) => value === last)!;
    if (minutes <= 60) notify(chat.members[from === 0 ? 1 : 0], chat.members[from], 'message', 'Conversation', conversation._id, 'sent you a message', ago(minutes * MINUTE));
  }
  console.log(`Conversations: ${CHATS.length}, messages: ${messageCount}`);

  await Notification.insertMany(notifications);
  console.log(`Notifications: ${notifications.length}`);

  // 9. Behaviour history for the recommender. Keywords are captured exactly as the app does when it records a signal.
  const interactions = SIGNALS.map((signal) => seedInteraction(signal, { id, postIds, groupIds }));
  await Interaction.insertMany(interactions);
  console.log(`Recommendation signals: ${interactions.length} (demo account starts with none)`);

  // 10. Cached feeds, profiles, searches and suggestions would still show the old sample.
  await Promise.all([invalidateFeedCaches(), invalidateByPrefix('profile:'), invalidateByPrefix('group:'), invalidateByPrefix('search:'), invalidateByPrefix('rec:')]);

  const sample = url(avatar(PEOPLE[0]!.avatar)) || url(coverRequest(PEOPLE[0]!.cover));
  const origin = env.APP_ORIGIN[0]!;
  if (await isServedBy(origin, sample) === false) {
    console.warn(`
Warning: ${origin} cannot serve the seeded photos (${sample} returned an error).`);
    console.warn('The app is probably running in Docker, whose uploads volume is separate from apps/web/uploads on this machine.');
    console.warn('Copy the photos into the container with:  npm run seed:copy-docker   (or seed with: npm run seed:docker)');
  }

  const demo = PEOPLE.find((person) => person.key === DEMO_ACCOUNT)!;
  console.log(`\nSeed complete. Sign in with ${demo.email} / ${SEED_PASSWORD} (every sample account uses the same password).`);
}

/** Deletes everything the sample people created on a previous run, keeping the people and groups themselves. */
async function removePreviousSample(seedIds: Id[], groupIds: Id[]) {
  const seedPosts = await Post.find({ authorId: { $in: seedIds } }).distinct('_id');
  // Posts by other accounts that sample people reacted to or commented on need their counters fixed afterwards.
  const touched = [
    ...await Reaction.find({ userId: { $in: seedIds }, postId: { $nin: seedPosts } }).distinct('postId'),
    ...await Comment.find({ authorId: { $in: seedIds }, postId: { $nin: seedPosts } }).distinct('postId')
  ];
  const seedStories = await Story.find({ authorId: { $in: seedIds } }).distinct('_id');
  // Conversations where every member is a sample person.
  const conversations = await Conversation.find({ memberIds: { $not: { $elemMatch: { $nin: seedIds } } } }).distinct('_id');
  const bothSeed = (a: string, b: string) => ({ [a]: { $in: seedIds }, [b]: { $in: seedIds } });

  await Promise.all([
    Reaction.deleteMany({ $or: [{ postId: { $in: seedPosts } }, { userId: { $in: seedIds } }] }),
    Comment.deleteMany({ $or: [{ postId: { $in: seedPosts } }, { authorId: { $in: seedIds } }] }),
    GroupPost.deleteMany({ postId: { $in: seedPosts } }),
    Post.deleteMany({ _id: { $in: seedPosts } }),
    StoryView.deleteMany({ $or: [{ storyId: { $in: seedStories } }, { viewerId: { $in: seedIds } }] }),
    Story.deleteMany({ _id: { $in: seedStories } }),
    Message.deleteMany({ conversationId: { $in: conversations } }),
    Conversation.deleteMany({ _id: { $in: conversations } }),
    Notification.deleteMany({ $or: [{ recipientId: { $in: seedIds } }, { actorId: { $in: seedIds } }] }),
    Interaction.deleteMany({ userId: { $in: seedIds } }),
    Follow.deleteMany(bothSeed('followerId', 'followingId')),
    Friendship.deleteMany(bothSeed('userAId', 'userBId')),
    GroupMember.deleteMany({ groupId: { $in: groupIds }, userId: { $in: seedIds } }),
    GroupJoinRequest.deleteMany({ groupId: { $in: groupIds }, userId: { $in: seedIds } }),
    GroupInvite.deleteMany({ groupId: { $in: groupIds }, userId: { $in: seedIds } })
  ]);
  await recountPosts(touched);
}

const snippet = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);

/** One stored signal (see services/activity.service.ts) built from the sample data instead of the database. */
function seedInteraction(signal: SeedSignal, refs: { id: (key: string) => Id; postIds: Map<string, Id>; groupIds: Map<string, Id> }) {
  const createdAt = ago(signal.hoursAgo * HOUR);
  const base = { userId: refs.id(signal.user), type: signal.type, durationMs: signal.durationMs || 0, authorId: null as Id | null, groupId: null as Id | null, createdAt };
  if (signal.query) return { ...base, targetType: 'query', targetId: null, label: signal.query, features: topFeatures(analyze(queryText(signal.query))) };
  if (signal.post) {
    const post = POSTS.find((item) => item.key === signal.post);
    if (!post) throw new Error(`Unknown seed post "${signal.post}" in a signal`);
    const group = post.group ? GROUPS.find((item) => item.slug === post.group) : null;
    return {
      ...base, targetType: 'post', targetId: refs.postIds.get(post.key)!, authorId: refs.id(post.author), groupId: post.group ? refs.groupIds.get(post.group)! : null,
      label: snippet(post.text), features: topFeatures(analyze(postText({ content: post.text, place: post.place, feeling: post.feeling }, group)))
    };
  }
  if (signal.profile) {
    const person = PEOPLE.find((item) => item.key === signal.profile);
    if (!person) throw new Error(`Unknown seed person "${signal.profile}" in a signal`);
    const texts = POSTS.filter((item) => item.author === person.key && !item.group && (item.visibility || 'public') === 'public').map((item) => item.text);
    return { ...base, targetType: 'user', targetId: refs.id(person.key), authorId: refs.id(person.key), label: person.displayName, features: topFeatures(analyze(userText({ profile: { privacy: 'public', ...person.profile } }, texts))) };
  }
  const group = GROUPS.find((item) => item.slug === signal.group);
  if (!group) throw new Error(`Unknown seed group "${signal.group}" in a signal`);
  const texts = POSTS.filter((item) => item.group === group.slug).map((item) => item.text);
  return { ...base, targetType: 'group', targetId: refs.groupIds.get(group.slug)!, groupId: refs.groupIds.get(group.slug)!, label: group.name, features: topFeatures(analyze(groupText(group, texts))) };
}

async function recountPosts(postIds: Id[]) {
  for (const postId of postIds) {
    await Post.updateOne({ _id: postId }, {
      reactionCount: await Reaction.countDocuments({ postId }),
      commentCount: await Comment.countDocuments({ postId, deletedAt: null })
    }, { timestamps: false });
  }
}

seed()
  .then(() => disconnectInfrastructure())
  .catch(async (error) => { console.error(error); await disconnectInfrastructure(); process.exit(1); });
