import type { Request, Response } from 'express';
import { storyReactionSchema, storyReplySchema, storySchema, storySettingsSchema } from '../validators/index.js';
import * as stories from '../services/story.service.js';
import { emitUserEvent } from '../services/notification.service.js';
import { countUnreadConversations } from '../services/message.service.js';
import { trackSignal } from '../services/activity.service.js';

const id = (req: Request) => req.user!.id;
const storyId = (req: Request) => String(req.params.storyId);

export async function tray(req: Request, res: Response) { res.json({ ok: true, data: { tray: await stories.getStoryTray(id(req)) } }); }
export async function create(req: Request, res: Response) { const story = await stories.createStory(id(req), storySchema.parse(req.body), req.file); res.status(201).json({ ok: true, data: { story, redirect: `/stories/${req.user!.username}` } }); }
export async function view(req: Request, res: Response) {
  const result = await stories.markViewed(storyId(req), id(req));
  if ('seen' in result) trackSignal(id(req), { type: 'story_view', targetType: 'story', targetId: storyId(req) });
  res.json({ ok: true, data: result });
}
export async function react(req: Request, res: Response) { const { type } = storyReactionSchema.parse(req.body); res.json({ ok: true, data: await stories.reactToStory(storyId(req), id(req), type) }); }
export async function reply(req: Request, res: Response) {
  const { content } = storyReplySchema.parse(req.body);
  const result = await stories.replyToStory(storyId(req), id(req), content);
  const message = result.message.toObject();
  await Promise.all([id(req), ...result.recipients].map(async (userId: string) => emitUserEvent(userId, 'message:new', { ...message, unreadMessages: await countUnreadConversations(userId) })));
  res.status(201).json({ ok: true, data: { conversationId: result.conversationId, message: 'Reply sent.' } });
}
export async function viewers(req: Request, res: Response) { res.json({ ok: true, data: await stories.listViewers(storyId(req), id(req)) }); }
export async function remove(req: Request, res: Response) { await stories.deleteStory(storyId(req), id(req)); res.json({ ok: true, data: { deleted: true } }); }
export async function settings(req: Request, res: Response) { const { audience } = storySettingsSchema.parse(req.body); res.json({ ok: true, data: { ...(await stories.updateStorySettings(id(req), audience)), message: 'Story settings saved.' } }); }
