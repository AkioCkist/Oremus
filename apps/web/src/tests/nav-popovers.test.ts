import path from 'node:path';
import ejs from 'ejs';
import { describe, expect, it } from 'vitest';
import { viewHelpers } from '../utils/view-helpers.js';

describe('header popovers', () => {
  it('keeps chats and notifications in header popovers with full-page links', async () => {
    const html = await ejs.renderFile(path.resolve('src/views/partials/nav.ejs'), {
      ...viewHelpers,
      path: '/',
      currentUser: { _id: 'me', username: 'me', displayName: 'Me' },
      unreadMessages: 1,
      unreadNotifications: 1,
      headerConversations: [{
        _id: 'conversation-1',
        memberIds: [{ _id: 'me', displayName: 'Me' }, { _id: 'friend', username: 'friend', displayName: 'Friend' }],
        lastMessage: { senderId: 'friend', content: 'Hello there', createdAt: new Date() },
        unread: true
      }],
      headerNotifications: [{
        actorId: { _id: 'friend', username: 'friend', displayName: 'Friend' },
        entityType: 'Post', entityId: 'post-1', text: 'commented on your post', createdAt: new Date(), readAt: null
      }]
    });

    expect(html).toContain('aria-label="Recent chats"');
    expect(html).toContain('data-read-on-open="messages"');
    expect(html).toContain('href="/messages/conversation-1"');
    expect(html).toContain('data-mini-chat="conversation-1"');
    expect(html).toContain('Go to chats');
    expect(html).toContain('aria-label="Recent notifications"');
    expect(html).toContain('data-read-on-open="notifications"');
    expect(html).toContain('href="/posts/post-1"');
    expect(html).toContain('View all notifications');
  });

  it('marks every rendered unread badge as a live update target', async () => {
    const html = await ejs.renderFile(path.resolve('src/views/partials/sidebar.ejs'), {
      ...viewHelpers,
      path: '/',
      currentUser: { username: 'me' },
      unreadMessages: 12,
      unreadNotifications: 3
    });

    expect(html).toContain('data-badge-link="messages"');
    expect(html).toContain('data-badge-link="notifications"');
    expect(html.match(/\sdata-badge(?=[\s>])/g)).toHaveLength(2);
  });
});
