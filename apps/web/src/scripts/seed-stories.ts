import { connectInfrastructure, disconnectInfrastructure } from '../config/database.js';
import { Follow, Notification, Story, StoryView, User, STORY_TTL_MS } from '../models/index.js';
import { invalidateByPrefix, invalidateFeedCaches } from '../services/cache.service.js';
import { PEOPLE, STORIES } from './seed-data.js';
import { prepareSeedImages, storyImage } from './seed-media.js';
import { pick, rng, shuffle } from './seed-random.js';

/**
 * `npm run seed:stories`: refreshes only the sample stories. Stories expire after 24 hours, so this brings them back
 * without touching people, posts, groups or chats, and in a minute once the photos are downloaded.
 *
 * Replaces the stories a previous seed created, with their views and reaction notifications.
 * Stories anyone posted by hand are kept. Needs the sample people, so run `npm run seed` once first.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

async function seedStories() {
  await connectInfrastructure();
  const now = Date.now();

  const users = await User.find({ email: { $in: PEOPLE.map((person) => person.email) } }).select('email').lean();
  const idByEmail = new Map(users.map((user) => [String(user.email), user._id]));
  const peopleWithId = PEOPLE.flatMap((person) => {
    const id = idByEmail.get(person.email);
    return id ? [{ ...person, id }] : [];
  });
  const byKey = new Map(peopleWithId.map((person) => [person.key, person]));
  const stories = STORIES.filter((story) => byKey.has(story.author));
  if (!stories.length) throw new Error('The sample people are missing. Run `npm run seed` first.');

  console.log('Preparing photos (downloaded once, then reused from uploads/)…');
  const url = await prepareSeedImages(stories.filter((story) => story.photo).map((story) => storyImage(story.photo!)));

  const previous = await Story.find({ seedKey: { $exists: true } }).distinct('_id');
  await Promise.all([
    StoryView.deleteMany({ storyId: { $in: previous } }),
    Notification.deleteMany({ entityType: 'Story', entityId: { $in: previous } })
  ]);
  await Story.deleteMany({ _id: { $in: previous } });

  const follows = await Follow.find({ followingId: { $in: peopleWithId.map((person) => person.id) } }).select('followerId followingId').lean();
  const keyById = new Map(peopleWithId.map((person) => [String(person.id), person.key]));
  const followersOf = new Map<string, string[]>();
  for (const follow of follows) {
    const author = keyById.get(String(follow.followingId)), follower = keyById.get(String(follow.followerId));
    if (author && follower) followersOf.set(author, [...(followersOf.get(author) || []), follower]);
  }

  const views: Record<string, unknown>[] = [];
  const notifications: Record<string, unknown>[] = [];
  for (const [index, story] of stories.entries()) {
    const random = rng(`story:${index}`);
    const author = byKey.get(story.author)!;
    const createdAt = new Date(now - story.minutesAgo * MINUTE);
    const isPublic = String(author.profile.storyAudience) === 'public';
    const audience = isPublic ? peopleWithId.map((person) => person.key) : followersOf.get(story.author) || [];
    const viewers = shuffle(audience.filter((key) => key !== story.author), random).slice(0, 3 + Math.floor(random() * 9));
    const mediaUrl = story.photo ? url(storyImage(story.photo)) : '';
    const doc = await Story.create({
      seedKey: `story-${index}`, authorId: author.id, media: mediaUrl ? { url: mediaUrl, mimeType: 'image/webp' } : null,
      text: story.text || '', background: story.background || 'ocean', style: story.text ? { ...story.style } : null,
      audience: isPublic ? 'public' : 'followers', viewCount: viewers.length, deletedAt: null,
      createdAt, updatedAt: createdAt, expiresAt: new Date(createdAt.getTime() + STORY_TTL_MS)
    });
    for (const key of viewers) {
      const viewerId = byKey.get(key)!.id;
      const seen = new Date(Math.min(now - MINUTE, createdAt.getTime() + random() * story.minutesAgo * MINUTE));
      const reaction = random() < 0.25 ? pick(['love', 'haha', 'like'], random) : null;
      views.push({ storyId: doc._id, viewerId, reaction, createdAt: seen, updatedAt: seen });
      if (reaction) notifications.push({ recipientId: author.id, actorId: viewerId, type: 'story_reaction', entityType: 'Story', entityId: doc._id, text: `reacted ${reaction} to your story`, createdAt: seen, updatedAt: seen, readAt: now - seen.getTime() > 12 * HOUR ? seen : null });
    }
  }
  await StoryView.insertMany(views);
  await Notification.insertMany(notifications);
  await Promise.all([invalidateFeedCaches(), invalidateByPrefix('rec:')]);
  console.log(`Stories: ${stories.length}, views: ${views.length}, removed from the last run: ${previous.length}.`);
}

seedStories()
  .then(() => disconnectInfrastructure())
  .catch(async (error) => { console.error(error instanceof Error ? error.message : error); await disconnectInfrastructure(); process.exit(1); });
