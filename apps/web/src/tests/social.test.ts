import path from 'node:path';
import ejs from 'ejs';
import sanitizeHtml from 'sanitize-html';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Block, Conversation, Follow, Friendship, Message, User } from '../models/index.js';
import { changeFriendship } from '../services/friendship.service.js';
import { createConversation, sendMessage } from '../services/message.service.js';
import { toggleFollow } from '../services/user.service.js';

describe('friend controls HTML regression', () => {
  it.each([
    ['none', ['request']], ['outgoing', ['cancel']], ['incoming', ['accept', 'decline']], ['friends', ['unfriend']]
  ])('renders real clickable buttons in the %s state', async (state, actions) => {
    const html = await ejs.renderFile(path.resolve('src/views/partials/friend-controls.ejs'), {
      person: { _id: 'person', displayName: 'A person' }, state, compact: false, full: false
    });
    // Parse the rendered HTML, not just the EJS syntax. A missing closing quote
    // previously swallowed the first button's opening tag in the browser.
    const parsed = sanitizeHtml(html, { allowedTags: ['button'], allowedAttributes: { button: ['type', 'data-friend-action'] } });
    for (const action of actions as string[]) expect(parsed).toContain(`<button type="button" data-friend-action="${action}">`);
  });
});

describe('block authorization', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prevents following and sending a friend request through the API service', async () => {
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: 'target' } as any);
    vi.spyOn(User, 'findOne').mockResolvedValue({ _id: 'target' } as any);
    vi.spyOn(Block, 'exists').mockResolvedValue({ _id: 'block' } as any);
    const followWrite = vi.spyOn(Follow, 'updateOne'), friendshipWrite = vi.spyOn(Friendship, 'create');
    await expect(toggleFollow('actor', 'target')).rejects.toMatchObject({ code: 'USER_BLOCKED' });
    await expect(changeFriendship('actor', 'target', 'request')).rejects.toMatchObject({ code: 'USER_BLOCKED' });
    expect(followWrite).not.toHaveBeenCalled(); expect(friendshipWrite).not.toHaveBeenCalled();
  });

  it('denies new and existing chats even if a stale friendship remains', async () => {
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: 'target' } as any);
    vi.spyOn(Block, 'exists').mockResolvedValue({ _id: 'block' } as any);
    vi.spyOn(Conversation, 'findOne').mockResolvedValue({ memberIds: ['actor', 'target'] } as any);
    const write = vi.spyOn(Message, 'create');
    await expect(createConversation('actor', 'target')).rejects.toMatchObject({ code: 'FRIENDSHIP_REQUIRED' });
    await expect(sendMessage('actor', 'chat', 'blocked message')).rejects.toMatchObject({ code: 'FRIENDSHIP_REQUIRED' });
    expect(write).not.toHaveBeenCalled();
  });
});
