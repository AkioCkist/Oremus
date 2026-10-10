import { connectInfrastructure, disconnectInfrastructure } from '../config/database.js';
import { User, Follow, Post, Reaction, Comment, Group, GroupMember, GroupJoinRequest, GroupPost, Conversation, Message, Notification, RefreshToken, AuditLog } from '../models/index.js';

async function migrate() {
  await connectInfrastructure();
  const models = [User, Follow, Post, Reaction, Comment, Group, GroupMember, GroupJoinRequest, GroupPost, Conversation, Message, Notification, RefreshToken, AuditLog];
  for (const model of models) await model.syncIndexes();
  console.log(`Synchronized indexes for ${models.length} collections.`);
  await disconnectInfrastructure();
}

migrate().catch(async (error) => { console.error(error); await disconnectInfrastructure(); process.exit(1); });
