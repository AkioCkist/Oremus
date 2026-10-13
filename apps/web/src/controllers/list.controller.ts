import type { Request, Response } from 'express';
import { FEED_PAGE_SIZE, getFeed } from '../services/feed.service.js';
import { listGroups } from '../services/group.service.js';
import { groupMembers, groupPosts, notificationChunk, profileMedia, profilePosts } from '../services/lists.service.js';
import { conversationChunk, listMessages } from '../services/message.service.js';
import { listComments, withReactionSummary } from '../services/post.service.js';
import { listArchive } from '../services/story.service.js';
import { AppError } from '../utils/errors.js';
import { parseOffsetCursor, type Chunk } from '../utils/paginate.js';

/**
 * Endless lists: `GET /api/lists/:name?cursor=…&…` returns the next chunk as HTML rendered with the
 * same partial the page uses (`views/partials/chunks/<name>.ejs`), plus the cursor for the chunk after it.
 * The page renders the first chunk itself and puts `next` on the list container (see infinite.ts).
 */

type Loaded = Chunk<any> & { locals?: Record<string, unknown> };
type ListDefinition = {
  /** Lists for signed-in users only. */
  auth?: boolean;
  /** Also return the raw items, for client-side renderers (photo viewer comments, mini chat). */
  json?: boolean;
  load: (req: Request, cursor: string) => Promise<Loaded>;
};

const userId = (req: Request) => req.user?.id as string | undefined;
const text = (req: Request, name: string) => String(req.query[name] ?? '');

/** Home feed keeps its follow-priority order, so it pages by offset (see getFeed). */
export async function feedChunk(viewerId: string, cursor: unknown): Promise<Chunk<any>> {
  const offset = parseOffsetCursor(cursor);
  const page = Math.floor(offset / FEED_PAGE_SIZE) + 1;
  if (page > 100) return { items: [], next: null };
  const result = await getFeed(viewerId, page);
  return { items: await withReactionSummary(result.items, viewerId), next: result.hasMore ? `o${page * FEED_PAGE_SIZE}` : null };
}

export const LISTS: Record<string, ListDefinition> = {
  feed: { auth: true, load: (req, cursor) => feedChunk(userId(req)!, cursor) },
  'group-posts': { load: (req, cursor) => groupPosts(req.query.group, userId(req), cursor) },
  'group-members': { load: (req, cursor) => groupMembers(req.query.group, userId(req), cursor) },
  groups: { load: (req, cursor) => listGroups(userId(req), cursor) },
  'profile-posts': { load: (req, cursor) => profilePosts(text(req, 'user'), userId(req), text(req, 'q').trim(), cursor) },
  'profile-media': {
    load: async (req, cursor) => {
      const { isSelf, ...chunk } = await profileMedia(text(req, 'user'), userId(req), text(req, 'type'), text(req, 'sort'), cursor);
      return { ...chunk, locals: { isSelf } };
    }
  },
  comments: {
    json: true,
    load: async (req, cursor) => {
      const { comments, next, post, canModerate } = await listComments(text(req, 'post'), userId(req), cursor);
      return { items: comments, next, locals: { post, canModerate } };
    }
  },
  messages: {
    auth: true, json: true,
    load: (req, cursor) => listMessages(userId(req)!, text(req, 'conversation'), cursor)
  },
  conversations: {
    auth: true,
    load: async (req, cursor) => ({ ...await conversationChunk(userId(req)!, cursor), locals: { activeConversation: text(req, 'active') } })
  },
  notifications: {
    auth: true,
    load: async (req, cursor) => {
      const openedAt = new Date(Number(text(req, 'opened')) || Date.now());
      return { ...await notificationChunk(userId(req)!, text(req, 'filter') === 'unread', openedAt, cursor), locals: { openedAt } };
    }
  },
  'story-archive': { auth: true, load: (req, cursor) => listArchive(userId(req)!, cursor) }
};

export async function listChunk(req: Request, res: Response) {
  const definition = LISTS[String(req.params.name)];
  if (!definition) throw new AppError(404, 'Unknown list.', 'LIST_NOT_FOUND');
  if (definition.auth && !req.user) throw new AppError(401, 'Please sign in to continue.', 'AUTH_REQUIRED');
  const cursor = text(req, 'cursor');
  if (!cursor) throw new AppError(422, 'A cursor is required; the page renders the first chunk.', 'CURSOR_REQUIRED');
  const { items, next, locals = {} } = await definition.load(req, cursor);
  const view = { title: '', path: req.path, csrfToken: req.cookies?.csrf || '', currentUser: req.user?.toObject() ?? null, items, now: Date.now(), ...locals };
  const html = await new Promise<string>((resolve, reject) => res.render(`partials/chunks/${req.params.name}`, view, (error, output) => (error ? reject(error) : resolve(output))));
  res.json({ ok: true, data: { html, next, ...(definition.json ? { items } : {}) } });
}
