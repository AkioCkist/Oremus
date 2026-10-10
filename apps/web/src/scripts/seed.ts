import bcrypt from 'bcryptjs';
import { connectInfrastructure, disconnectInfrastructure } from '../config/database.js';
import { Comment, Conversation, Follow, Group, GroupMember, GroupPost, Message, Post, Reaction, Story, User, STORY_TTL_MS } from '../models/index.js';

async function seed() {
  await connectInfrastructure();
  const passwordHash = await bcrypt.hash('CircleSpace123', 12);
  const avatar = (name: string) => `/assets/img/avatars/${name}.svg`;
  const people = [
    { email: 'maya@example.com', username: 'maya', displayName: 'Maya Tran', profile: { bio: 'Community gardener, weekend cyclist, and collector of good questions.', location: 'Da Nang, Vietnam', website: 'https://example.com/maya', privacy: 'public', storyAudience: 'followers', avatarUrl: avatar('maya'), coverUrl: '/assets/img/seed/cover-maya.svg' } },
    { email: 'leo@example.com', username: 'leominh', displayName: 'Leo Minh', profile: { bio: 'Product designer exploring calmer digital spaces.', location: 'Ho Chi Minh City, Vietnam', privacy: 'public', storyAudience: 'public', avatarUrl: avatar('leominh') } },
    { email: 'anika@example.com', username: 'anikar', displayName: 'Anika Rao', profile: { bio: 'Documentary photographer and slow traveler.', location: 'Singapore', privacy: 'public', storyAudience: 'public', avatarUrl: avatar('anikar'), coverUrl: '/assets/img/seed/rock.svg' } },
    { email: 'jonah@example.com', username: 'jonahlee', displayName: 'Jonah Lee', profile: { bio: 'Cooking, code, and city walks.', location: 'Hanoi, Vietnam', privacy: 'public', storyAudience: 'followers', avatarUrl: avatar('jonahlee') } },
    { email: 'ethan@example.com', username: 'ethanr', displayName: 'Ethan Reynolds', profile: { bio: 'Trail runner. Mountain person. Bad at sitting still.', location: 'Da Lat, Vietnam', privacy: 'public', storyAudience: 'public', avatarUrl: avatar('ethanr') } },
    { email: 'olivia@example.com', username: 'oliviah', displayName: 'Olivia Hayes', profile: { bio: 'Dog mom, latte art enthusiast, part-time illustrator.', location: 'Hoi An, Vietnam', privacy: 'public', storyAudience: 'public', avatarUrl: avatar('olivia') } }
  ];
  const users: any[] = [];
  for (const person of people) users.push(await User.findOneAndUpdate({ email: person.email }, { ...person, passwordHash, deletedAt: null }, { upsert: true, new: true, setDefaultsOnInsert: true }));
  const [maya, leo, anika, jonah, ethan, olivia] = users;
  const follows = [[maya, leo], [maya, anika], [maya, ethan], [maya, olivia], [leo, maya], [anika, maya], [ethan, maya], [olivia, maya], [jonah, maya], [olivia, anika]];
  for (const [follower, following] of follows) await Follow.updateOne({ followerId: follower.id, followingId: following.id }, {}, { upsert: true });
  const group = await Group.findOneAndUpdate({ slug: 'city-gardeners' }, { name: 'City Gardeners', slug: 'city-gardeners', description: 'Practical growing advice for balconies, rooftops, and small urban spaces.', coverUrl: '/assets/img/seed/garden-cover.svg', privacy: 'public', ownerId: maya.id, memberCount: 3 }, { upsert: true, new: true });
  for (const [user, role] of [[maya, 'admin'], [leo, 'member'], [jonah, 'member']] as const) await GroupMember.updateOne({ groupId: group.id, userId: user.id }, { role }, { upsert: true });
  const photoGroup = await Group.findOneAndUpdate({ slug: 'street-photography' }, { name: 'Street Photography', slug: 'street-photography', description: 'Candid city moments, gear talk, and weekly photo walks across Southeast Asia.', coverUrl: '/assets/img/seed/photo-cover.svg', privacy: 'public', ownerId: anika.id, memberCount: 3 }, { upsert: true, new: true });
  for (const [user, role] of [[anika, 'admin'], [maya, 'member'], [olivia, 'member']] as const) await GroupMember.updateOne({ groupId: photoGroup.id, userId: user.id }, { role }, { upsert: true });
  const postData = [
    { seedKey: 'seed-welcome', authorId: maya.id, content: 'I started Oremus to make online conversation feel a little more like sharing a table. What is one small thing your community taught you this week?', visibility: 'public' },
    { seedKey: 'seed-design', authorId: leo.id, content: 'A useful design test: can someone understand the next action without reading every word? Clarity is a form of kindness.', visibility: 'public' },
    { seedKey: 'seed-photo', authorId: anika.id, content: 'Early light at the market, before the streets fully wake. The quiet hour always tells a different story.', visibility: 'public', media: [{ url: '/assets/img/seed/market.svg', mimeType: 'image/svg+xml', alt: 'A market street at sunrise with fruit stalls and lanterns' }] },
    { seedKey: 'seed-garden', authorId: jonah.id, groupId: group.id, content: 'My basil finally recovered after moving it out of the afternoon sun. Sharing the watering schedule that worked for me.', visibility: 'public', media: [{ url: '/assets/img/seed/basil.svg', mimeType: 'image/svg+xml', alt: 'A potted basil plant on a sunny windowsill' }] },
    { seedKey: 'seed-trip', authorId: ethan.id, content: 'Finally made it to the rock fortress I have been dreaming about for years. Worth every one of the 1,200 steps.', visibility: 'public', media: [{ url: '/assets/img/seed/rock.svg', mimeType: 'image/svg+xml', alt: 'A huge rock fortress rising above the jungle' }, { url: '/assets/img/seed/mountain-story.svg', mimeType: 'image/svg+xml', alt: 'A cyclist riding through green mountains' }] },
    { seedKey: 'seed-latte', authorId: olivia.id, content: 'Two flat whites, one very patient barista, and zero plans for the afternoon.', visibility: 'public' }
  ];
  const posts: any[] = [];
  for (const data of postData) posts.push(await Post.findOneAndUpdate({ seedKey: data.seedKey }, { ...data, reactionCount: 0, commentCount: 0, deletedAt: null }, { upsert: true, new: true, strict: false }));
  await GroupPost.updateOne({ postId: posts[3].id }, { groupId: group.id, authorId: jonah.id }, { upsert: true });
  await Reaction.updateOne({ userId: maya.id, postId: posts[1].id }, { type: 'love' }, { upsert: true });
  await Reaction.updateOne({ userId: leo.id, postId: posts[0].id }, { type: 'like' }, { upsert: true });
  await Comment.updateOne({ postId: posts[0].id, authorId: leo.id, content: /This week/ }, { content: 'This week I learned that asking for help early makes a project stronger, not weaker.' }, { upsert: true });
  await Reaction.updateOne({ userId: olivia.id, postId: posts[0].id }, { type: 'love' }, { upsert: true });
  await Reaction.updateOne({ userId: maya.id, postId: posts[4].id }, { type: 'wow' }, { upsert: true });
  await Reaction.updateOne({ userId: anika.id, postId: posts[4].id }, { type: 'like' }, { upsert: true });
  await Reaction.updateOne({ userId: maya.id, postId: posts[5].id }, { type: 'haha' }, { upsert: true });
  await Comment.updateOne({ postId: posts[4].id, authorId: maya.id, content: /steps/ }, { content: 'Those steps would have defeated me halfway. The view looks unreal!' }, { upsert: true });
  for (const post of posts) await Post.updateOne({ _id: post.id }, { reactionCount: await Reaction.countDocuments({ postId: post.id }), commentCount: await Comment.countDocuments({ postId: post.id, deletedAt: null }) });
  const conversation = await Conversation.findOneAndUpdate({ seedKey: 'maya-leo' }, { memberIds: [maya.id, leo.id], lastMessageAt: new Date() }, { upsert: true, new: true, strict: false });
  if (!(await Message.exists({ conversationId: conversation.id }))) {
    await Message.create({ conversationId: conversation.id, senderId: leo.id, content: 'The new community page feels thoughtful. Want to review it together tomorrow?', readBy: [leo.id] });
    await Message.create({ conversationId: conversation.id, senderId: maya.id, content: 'Yes! My notes are here: https://example.com/maya/community-notes', readBy: [maya.id, leo.id] });
  }
  const chat = await Conversation.findOneAndUpdate({ seedKey: 'maya-olivia' }, { memberIds: [maya.id, olivia.id], lastMessageAt: new Date() }, { upsert: true, new: true, strict: false });
  if (!(await Message.exists({ conversationId: chat.id }))) {
    await Message.create({ conversationId: chat.id, senderId: maya.id, content: 'On my way, but there is a crying baby on the bus and I forgot my headphones.', readBy: [maya.id, olivia.id] });
    await Message.create({ conversationId: chat.id, senderId: olivia.id, content: 'Oh boy! You will manage. Just do not be late :D', readBy: [olivia.id] });
  }

  // Stories are refreshed on every seed run so they stay inside the 24-hour window.
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  const stories = [
    { seedKey: 'story-ethan-mountain', authorId: ethan.id, media: { url: '/assets/img/seed/mountain-story.svg', mimeType: 'image/svg+xml' }, text: 'Morning ride before the clouds roll in', audience: 'public', at: 5 },
    { seedKey: 'story-olivia-coffee', authorId: olivia.id, media: { url: '/assets/img/seed/coffee-story.svg', mimeType: 'image/svg+xml' }, text: '', audience: 'public', at: 20 },
    { seedKey: 'story-olivia-text', authorId: olivia.id, media: null, text: 'Lantern night in Hoi An tonight. Who is coming?', background: 'sunset', audience: 'public', at: 12 },
    { seedKey: 'story-leo-corgi', authorId: leo.id, media: { url: '/assets/img/seed/corgi-story.svg', mimeType: 'image/svg+xml' }, text: 'Meet my new office manager', audience: 'public', at: 120 },
    { seedKey: 'story-anika-market', authorId: anika.id, media: { url: '/assets/img/seed/market.svg', mimeType: 'image/svg+xml' }, text: '', audience: 'public', at: 150 },
    { seedKey: 'story-maya-text', authorId: maya.id, media: null, text: 'Seedlings are up!', background: 'forest', audience: 'followers', at: 300 }
  ];
  for (const { at, ...story } of stories) {
    const createdAt = minutesAgo(at);
    await Story.findOneAndUpdate({ seedKey: story.seedKey }, { background: 'ocean', ...story, viewCount: 0, deletedAt: null, createdAt, updatedAt: createdAt, expiresAt: new Date(createdAt.getTime() + STORY_TTL_MS) }, { upsert: true, new: true, strict: false, timestamps: false });
  }
  console.log('Seed complete. Sign in with maya@example.com / CircleSpace123');
  await disconnectInfrastructure();
}

seed().catch(async (error) => { console.error(error); await disconnectInfrastructure(); process.exit(1); });

