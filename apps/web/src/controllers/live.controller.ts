import type { Request, Response } from 'express';
import { headerState } from './page.controller.js';
import { notificationChunk } from '../services/lists.service.js';
import { conversationChunk, listMessages } from '../services/message.service.js';

/**
 * Live state: `GET /api/live` returns everything the page shows that can change without the user doing anything
 * (header badges, the chats and notifications popovers), rendered with the same partials the page uses.
 * The client calls it after a realtime event, after the socket reconnects and when a stale tab comes back,
 * so the page catches up on anything it missed while it was disconnected.
 *
 * Optional extras for the page being viewed:
 *   - `notifications=<openedAt ms>&filter=all|unread`  newest notification rows (notifications page)
 *   - `chats=<active id>`                              newest chat list rows (chats page)
 *   - `conversation=<id>`                             newest messages of the open chat (raw items)
 */

const text = (req: Request, name: string) => String(req.query[name] ?? '');

function renderView(res: Response, view: string, locals: Record<string, unknown>) {
  return new Promise<string>((resolve, reject) => res.render(view, locals, (error, output) => (error ? reject(error) : resolve(output))));
}

export async function live(req: Request, res: Response) {
  const userId = req.user!.id;
  const currentUser = req.user!.toObject();
  const state = await headerState(userId);
  const locals = { ...state, currentUser, path: '', title: '' };
  const [chatsHtml, notificationsHtml] = await Promise.all([renderView(res, 'partials/header-chats', locals), renderView(res, 'partials/header-notifications', locals)]);
  const data: Record<string, unknown> = { unreadNotifications: state.unreadNotifications, unreadMessages: state.unreadMessages, chatsHtml, notificationsHtml };

  const opened = Number(text(req, 'notifications'));
  if (opened) {
    const openedAt = new Date(opened);
    const chunk = await notificationChunk(userId, text(req, 'filter') === 'unread', openedAt, null);
    data.notificationRows = await renderView(res, 'partials/chunks/notifications', { ...locals, items: chunk.items, openedAt });
  }

  if (req.query.chats !== undefined) {
    const chunk = await conversationChunk(userId, null);
    data.chatRows = await renderView(res, 'partials/chunks/conversations', { ...locals, items: chunk.items, activeConversation: text(req, 'chats') });
  }

  const conversationId = text(req, 'conversation');
  if (/^[a-f0-9]{24}$/.test(conversationId)) {
    data.messages = await listMessages(userId, conversationId).then((chunk) => chunk.items).catch(() => []);
  }

  res.json({ ok: true, data });
}
