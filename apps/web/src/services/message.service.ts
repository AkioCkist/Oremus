import { Conversation, Message, User } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { notify } from './notification.service.js';

export async function createConversation(userId: string, memberId: string) {
  if (userId === memberId) throw new AppError(400, 'Choose another person.', 'INVALID_CONVERSATION');
  if (!(await User.exists({ _id: memberId, deletedAt: null }))) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
  const existing = await Conversation.findOne({ memberIds: { $all: [userId, memberId], $size: 2 } });
  return existing || Conversation.create({ memberIds: [userId, memberId] });
}

export async function listConversations(userId: string) {
  const conversations = await Conversation.find({ memberIds: userId }).sort({ lastMessageAt: -1 }).limit(60).populate('memberIds', 'username displayName profile.avatarUrl').lean();
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

export async function countUnreadConversations(userId: string): Promise<number> {
  const conversations = await Conversation.find({ memberIds: userId }).select('_id').lean();
  if (!conversations.length) return 0;
  const unread = await Message.distinct('conversationId', { conversationId: { $in: conversations.map((item: any) => item._id) }, senderId: { $ne: userId }, readBy: { $ne: userId }, deletedAt: null });
  return unread.length;
}

export async function listMessages(userId: string, conversationId: string) {
  if (!(await Conversation.exists({ _id: conversationId, memberIds: userId }))) throw new AppError(403, 'You do not have access to this conversation.', 'CONVERSATION_FORBIDDEN');
  return Message.find({ conversationId, deletedAt: null }).sort({ createdAt: 1 }).limit(100).populate('senderId', 'username displayName profile.avatarUrl').lean();
}

export async function sendMessage(userId: string, conversationId: string, content: string) {
  const conversation = await Conversation.findOne({ _id: conversationId, memberIds: userId });
  if (!conversation) throw new AppError(403, 'You do not have access to this conversation.', 'CONVERSATION_FORBIDDEN');
  const message = await Message.create({ conversationId, senderId: userId, content, readBy: [userId] });
  conversation.lastMessageAt = new Date(); await conversation.save();
  const recipients: string[] = conversation.memberIds.map((memberId: unknown) => String(memberId)).filter((memberId: string) => memberId !== userId);
  await Promise.all(recipients.map((recipientId: string) => notify({ recipientId, actorId: userId, type: 'message', entityType: 'Conversation', entityId: conversationId, text: 'sent you a message' })));
  return { message, recipients };
}
