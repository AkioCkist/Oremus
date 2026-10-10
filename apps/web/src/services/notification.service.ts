import { Block, Notification } from '../models/index.js';

export type Notifier = (userId: string, event: string, payload: unknown) => void;
let notifier: Notifier = () => undefined;
export const setNotifier = (value: Notifier) => { notifier = value; };
export const emitUserEvent = (userId: string, event: string, payload: unknown) => notifier(userId, event, payload);

export async function notify(input: { recipientId: string; actorId: string; type: string; entityType: string; entityId: string; text: string }): Promise<void> {
  if (input.recipientId === input.actorId) return;
  if (await Block.exists({ $or: [{ blockerId: input.actorId, blockedId: input.recipientId }, { blockerId: input.recipientId, blockedId: input.actorId }] })) return;
  const notification = await Notification.create(input);
  notifier(input.recipientId, 'notification:new', notification.toObject());
}

