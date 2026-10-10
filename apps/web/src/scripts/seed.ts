import bcrypt from 'bcryptjs';
import { connectInfrastructure, disconnectInfrastructure } from '../config/database.js';
import { Comment, Conversation, Follow, Group, GroupMember, GroupPost, Message, Post, Reaction, User } from '../models/index.js';

async function seed() {
  await connectInfrastructure();
  const passwordHash = await bcrypt.hash('CircleSpace123', 12);
  const people = [
    { email: 'maya@example.com', username: 'maya', displayName: 'Maya Tran', profile: { bio: 'Community gardener, weekend cyclist, and collector of good questions.', location: 'Da Nang, Vietnam', website: 'https://example.com/maya', privacy: 'public' } },
    { email: 'leo@example.com', username: 'leominh', displayName: 'Leo Minh', profile: { bio: 'Product designer exploring calmer digital spaces.', location: 'Ho Chi Minh City, Vietnam', privacy: 'public' } },
    { email: 'anika@example.com', username: 'anikar', displayName: 'Anika Rao', profile: { bio: 'Documentary photographer and slow traveler.', location: 'Singapore', privacy: 'public' } },
    { email: 'jonah@example.com', username: 'jonahlee', displayName: 'Jonah Lee', profile: { bio: 'Cooking, code, and city walks.', location: 'Hanoi, Vietnam', privacy: 'public' } }
  ];
  const users: any[] = [];
  for (const person of people) users.push(await User.findOneAndUpdate({ email: person.email }, { ...person, passwordHash, deletedAt: null }, { upsert: true, new: true, setDefaultsOnInsert: true }));
  const [maya, leo, anika, jonah] = users;
  await Follow.updateOne({ followerId: maya.id, followingId: leo.id }, {}, { upsert: true });
  await Follow.updateOne({ followerId: maya.id, followingId: anika.id }, {}, { upsert: true });
  const group = await Group.findOneAndUpdate({ slug: 'city-gardeners' }, { name: 'City Gardeners', slug: 'city-gardeners', description: 'Practical growing advice for balconies, rooftops, and small urban spaces.', privacy: 'public', ownerId: maya.id, memberCount: 3 }, { upsert: true, new: true });
  for (const [user, role] of [[maya, 'admin'], [leo, 'member'], [jonah, 'member']] as const) await GroupMember.updateOne({ groupId: group.id, userId: user.id }, { role }, { upsert: true });
  const postData = [
    { seedKey: 'seed-welcome', authorId: maya.id, content: 'I started Oremus to make online conversation feel a little more like sharing a table. What is one small thing your community taught you this week?', visibility: 'public' },
    { seedKey: 'seed-design', authorId: leo.id, content: 'A useful design test: can someone understand the next action without reading every word? Clarity is a form of kindness.', visibility: 'public' },
    { seedKey: 'seed-photo', authorId: anika.id, content: 'Early light at the market, before the streets fully wake. The quiet hour always tells a different story.', visibility: 'public' },
    { seedKey: 'seed-garden', authorId: jonah.id, groupId: group.id, content: 'My basil finally recovered after moving it out of the afternoon sun. Sharing the watering schedule that worked for me.', visibility: 'public' }
  ];
  const posts: any[] = [];
  for (const data of postData) posts.push(await Post.findOneAndUpdate({ seedKey: data.seedKey }, { ...data, reactionCount: 0, commentCount: 0, deletedAt: null }, { upsert: true, new: true, strict: false }));
  await GroupPost.updateOne({ postId: posts[3].id }, { groupId: group.id, authorId: jonah.id }, { upsert: true });
  await Reaction.updateOne({ userId: maya.id, postId: posts[1].id }, { type: 'love' }, { upsert: true });
  await Reaction.updateOne({ userId: leo.id, postId: posts[0].id }, { type: 'like' }, { upsert: true });
  await Comment.updateOne({ postId: posts[0].id, authorId: leo.id, content: /This week/ }, { content: 'This week I learned that asking for help early makes a project stronger, not weaker.' }, { upsert: true });
  await Post.updateOne({ _id: posts[0].id }, { reactionCount: 1, commentCount: 1 });
  await Post.updateOne({ _id: posts[1].id }, { reactionCount: 1 });
  const conversation = await Conversation.findOneAndUpdate({ seedKey: 'maya-leo' }, { memberIds: [maya.id, leo.id], lastMessageAt: new Date() }, { upsert: true, new: true, strict: false });
  if (!(await Message.exists({ conversationId: conversation.id }))) await Message.create({ conversationId: conversation.id, senderId: leo.id, content: 'The new community page feels thoughtful. Want to review it together tomorrow?', readBy: [leo.id] });
  console.log('Seed complete. Sign in with maya@example.com / CircleSpace123');
  await disconnectInfrastructure();
}

seed().catch(async (error) => { console.error(error); await disconnectInfrastructure(); process.exit(1); });

