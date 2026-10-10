import { Block, Notification } from '../models/index.js';

export type Notifier = (userId: string, event: string, payload: unknown) => void;
export type NotificationInput = { recipientId: string; actorId: string; type: string; entityType: string; entityId: string; text: string };
let notifier: Notifier = () => undefined;
export const setNotifier = (value: Notifier) => { notifier = value; };
export const emitUserEvent = (userId: string, event: string, payload: unknown) => notifier(userId, event, payload);

const pairKey = (left: unknown, right: unknown) => [String(left), String(right)].sort().join(':');

export async function notifyMany(inputs: NotificationInput[]): Promise<void> {
  const candidates = inputs.filter((input) => input.recipientId !== input.actorId);
  if (!candidates.length) return;
  const pairs = [...new Map(candidates.map((input) => [pairKey(input.actorId, input.recipientId), input])).values()];
  const blocks = await Block.find({
    $or: pairs.flatMap((input) => [
      { blockerId: input.actorId, blockedId: input.recipientId },
      { blockerId: input.recipientId, blockedId: input.actorId }
    ])
  }).select('blockerId blockedId').lean();
  const blocked = new Set(blocks.map((item: any) => pairKey(item.blockerId, item.blockedId)));
  const allowed = candidates.filter((input) => !blocked.has(pairKey(input.actorId, input.recipientId)));
  if (!allowed.length) return;
  const notifications = await Notification.insertMany(allowed);
  notifications.forEach((notification: any) => notifier(String(notification.recipientId), 'notification:new', notification.toObject()));
}

export async function notify(input: NotificationInput): Promise<void> {
  await notifyMany([input]);
}

