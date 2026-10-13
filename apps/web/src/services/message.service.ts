import { Conversation, Message, User } from '../models/index.js';
import { afterCursor, cursorSort, timeChunk } from '../utils/paginate.js';
import { AppError } from '../utils/errors.js';
import { notify } from './notification.service.js';
import { areFriends, listFriendIds } from './friendship.service.js';

export function conversationMemberFilter(userId: string, friendIds: Iterable<string>) {
  return { $and: [{ memberIds: userId }, { memberIds: { $in: [...friendIds] } }] };
}

async function conversationForFriend(userId: string, conversationId: string) {
  const conversation = await Conversation.findOne({ _id: conversationId, memberIds: userId });
  if (!conversation) throw new AppError(403, 'You do not have access to this conversation.', 'CONVERSATION_FORBIDDEN');
  const otherId = conversation.memberIds.map(String).find((memberId: string) => memberId !== String(userId));
  if (!otherId || !(await areFriends(userId, otherId))) throw new AppError(403, 'Only friends can chat.', 'FRIENDSHIP_REQUIRED');
  return conversation;
}

export async function createConversation(userId: string, memberId: string) {
  if (userId === memberId) throw new AppError(400, 'Choose another person.', 'INVALID_CONVERSATION');
  if (!(await User.exists({ _id: memberId, deletedAt: null }))) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
  if (!(await areFriends(userId, memberId))) throw new AppError(403, 'Only friends can start a chat.', 'FRIENDSHIP_REQUIRED');
  const existing = await Conversation.findOne({ memberIds: { $all: [userId, memberId], $size: 2 } });
  return existing || Conversation.create({ memberIds: [userId, memberId] });
}

export const CONVERSATION_PAGE_SIZE = 20;
export const MESSAGE_PAGE_SIZE = 30;

export async function listConversations(userId: string, limit = CONVERSATION_PAGE_SIZE) {
  return (await conversationChunk(userId, null, limit)).items;
}

/** Chats ordered by latest activity, `limit` at a time. */
export async function conversationChunk(userId: string, cursor: unknown, limit = CONVERSATION_PAGE_SIZE) {
  const friendIds = new Set(await listFriendIds(userId));
  if (!friendIds.size) return { items: [], next: null };
  const rows = await Conversation.find({ ...conversationMemberFilter(userId, friendIds), ...afterCursor(cursor, 'lastMessageAt') })
    .sort(cursorSort('lastMessageAt')).limit(limit + 1).populate('memberIds', 'username displayName profile.avatarUrl').lean();
  const { items: conversations, next } = timeChunk(rows as any[], limit, 'lastMessageAt');
  return { items: await withLastMessages(userId, conversations), next };
}

async function withLastMessages(userId: string, conversations: any[]) {
  if (!conversations.length) return [];
  const latest = await Message.aggregate([
    { $match: { conversationId: { $in: conversations.map((item: any) => item._id) }, deletedAt: null } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$conversationId', message: { $first: '$$ROOT' } } }
  ]);
  const lastByConversation = new Map(latest.map((row: any) => [String(row._id), row.message]));
  return conversations.map((conversation: any) => {
    const lastMessage = lastByConversation.get(String(conversation._id)) || null;
    const unread = !!lastMessage && String(lastMessage.senderId) !== userId && !lastMessage.readBy.some((id: unknown) => String(id) === userId);
    return { ...conversation, lastMessage, unread };
  });
}

export async function markConversationRead(userId: string, conversationId: string) {
  await Message.updateMany({ conversationId, readBy: { $ne: userId } }, { $addToSet: { readBy: userId } });
}

/** Marks a conversation read from the client (live chat) and returns the fresh unread-conversation count. */
export async function readConversation(userId: string, conversationId: string): Promise<number> {
  await conversationForFriend(userId, conversationId);
  await markConversationRead(userId, conversationId);
  return countUnreadConversations(userId);
}

export async function countUnreadConversations(userId: string): Promise<number> {
  const friendIds = new Set(await listFriendIds(userId));
  if (!friendIds.size) return 0;
  const conversations = await Conversation.find(conversationMemberFilter(userId, friendIds)).select('_id').lean();
  if (!conversations.length) return 0;
  const unread = await Message.distinct('conversationId', { conversationId: { $in: conversations.map((item: any) => item._id) }, senderId: { $ne: userId }, readBy: { $ne: userId }, deletedAt: null });
  return unread.length;
}

/**
 * The newest `MESSAGE_PAGE_SIZE` messages before the cursor, returned oldest-first for display.
 * `next` points further back in time (scrolling up loads older messages).
 */
export async function listMessages(userId: string, conversationId: string, cursor: unknown = null) {
  await conversationForFriend(userId, conversationId);
  const rows = await Message.find({ conversationId, deletedAt: null, ...afterCursor(cursor) }).sort(cursorSort()).limit(MESSAGE_PAGE_SIZE + 1)
    .populate('senderId', 'username displayName profile.avatarUrl').lean();
  const { items, next } = timeChunk(rows as any[], MESSAGE_PAGE_SIZE);
  return { items: items.reverse(), next };
}

/** Compact conversation payload used by the floating mini-chat. Opening it marks the thread read. */
export async function getConversationPreview(userId: string, conversationId: string) {
  const conversation: any = await conversationForFriend(userId, conversationId);
  await conversation.populate('memberIds', 'username displayName profile.avatarUrl');
  const recent = await listMessages(userId, conversationId);
  await markConversationRead(userId, conversationId);
  const partner = conversation.memberIds.find((member: any) => String(member._id) !== String(userId)) || conversation.memberIds[0];
  return { conversation: { _id: conversation._id, partner }, messages: recent.items, next: recent.next, unreadMessages: await countUnreadConversations(userId) };
}

export async function sendMessage(userId: string, conversationId: string, content: string) {
  const conversation = await conversationForFriend(userId, conversationId);
  const message = await Message.create({ conversationId, senderId: userId, content, readBy: [userId] });
  await message.populate('senderId', 'username displayName profile.avatarUrl');
  conversation.lastMessageAt = new Date(); await conversation.save();
  const recipients: string[] = conversation.memberIds.map((memberId: unknown) => String(memberId)).filter((memberId: string) => memberId !== userId);
  await Promise.all(recipients.map((recipientId: string) => notify({ recipientId, actorId: userId, type: 'message', entityType: 'Conversation', entityId: conversationId, text: 'sent you a message' })));
  return { message, recipients };
}
