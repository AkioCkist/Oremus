import { Block, Conversation, Friendship } from '../models/index.js';
import type { Migration } from './types.js';

// The id predates this folder: databases upgraded by the old migrate script already have it recorded.
export const friendshipExistingChats: Migration = {
  id: 'friendship-existing-chats-v1',
  description: 'Turn existing two-person chats into accepted friendships (messages now require a friendship).',
  async up() {
    // Only for the first upgrade. Must never restore an unfriended or blocked pair just because
    // its message history was kept, so skip entirely once any friendship or block exists.
    if (await Friendship.exists({}) || await Block.exists({})) return 'skipped: friendships already in use';
    const conversations = await Conversation.find({ 'memberIds.1': { $exists: true }, 'memberIds.2': { $exists: false } }).select('memberIds createdAt lastMessageAt').lean();
    let created = 0;
    for (const conversation of conversations) {
      const [userAId, userBId] = conversation.memberIds.map(String).sort();
      const result = await Friendship.updateOne(
        { userAId, userBId },
        { $setOnInsert: { requesterId: userAId, status: 'accepted', acceptedAt: conversation.createdAt || conversation.lastMessageAt || new Date() } },
        { upsert: true }
      );
      created += result.upsertedCount;
    }
    return `backfilled ${created} friendships`;
  }
};
