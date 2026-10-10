import { connectInfrastructure, disconnectInfrastructure } from '../config/database.js';
import mongoose from 'mongoose';
import { User, Follow, Friendship, Block, SocialPreference, Post, Reaction, Comment, Group, GroupMember, GroupJoinRequest, GroupPost, Conversation, Message, Notification, RefreshToken, AuditLog } from '../models/index.js';

async function migrate() {
  await connectInfrastructure();
  const models = [User, Follow, Friendship, Block, SocialPreference, Post, Reaction, Comment, Group, GroupMember, GroupJoinRequest, GroupPost, Conversation, Message, Notification, RefreshToken, AuditLog];
  for (const model of models) await model.syncIndexes();
  // Backfill only the first upgrade. Re-running migration must never restore an
  // unfriended or blocked pair simply because its message history was retained.
  const migrations = mongoose.connection.db!.collection<{ _id: string; completedAt: Date }>('migrations');
  const migrationId = 'friendship-existing-chats-v1';
  const migrated = await migrations.findOne({ _id: migrationId });
  const alreadyInstalled = await Friendship.exists({}) || await Block.exists({});
  const conversations = !migrated && !alreadyInstalled ? await Conversation.find({ 'memberIds.1': { $exists: true }, 'memberIds.2': { $exists: false } }).select('memberIds createdAt lastMessageAt').lean() : [];
  let friendshipsBackfilled = 0;
  for (const conversation of conversations) {
    const [userAId, userBId] = conversation.memberIds.map(String).sort();
    const result = await Friendship.updateOne(
      { userAId, userBId },
      { $setOnInsert: { requesterId: userAId, status: 'accepted', acceptedAt: conversation.createdAt || conversation.lastMessageAt || new Date() } },
      { upsert: true }
    );
    friendshipsBackfilled += result.upsertedCount;
  }
  await migrations.updateOne({ _id: migrationId }, { $setOnInsert: { completedAt: new Date() } }, { upsert: true });
  console.log(`Synchronized indexes for ${models.length} collections; backfilled ${friendshipsBackfilled} existing chat friendships.`);
  await disconnectInfrastructure();
}

migrate().catch(async (error) => { console.error(error); await disconnectInfrastructure(); process.exit(1); });
