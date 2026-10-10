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
  return Conversation.find({ memberIds: userId }).sort({ lastMessageAt: -1 }).populate('memberIds', 'username displayName profile.avatarUrl').lean();
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
