import { Notification } from '../models/index.js';

export type Notifier = (userId: string, event: string, payload: unknown) => void;
let notifier: Notifier = () => undefined;
export const setNotifier = (value: Notifier) => { notifier = value; };

export async function notify(input: { recipientId: string; actorId: string; type: string; entityType: string; entityId: string; text: string }): Promise<void> {
  if (input.recipientId === input.actorId) return;
  const notification = await Notification.create(input);
  notifier(input.recipientId, 'notification:new', notification.toObject());
}

