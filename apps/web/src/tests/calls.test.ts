import { jwtDecode } from './helpers/jwt.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const kv = vi.hoisted(() => new Map<string, string>());
vi.hoisted(() => {
  process.env.LIVEKIT_URL = 'wss://rtc.oremus.test';
  process.env.LIVEKIT_API_KEY = 'testkey';
  process.env.LIVEKIT_API_SECRET = 'testsecret-testsecret-testsecret-1234';
});
vi.mock('../config/database.js', () => ({
  checkInfrastructure: vi.fn(),
  redis: {
    set: vi.fn(async (key: string, value: string, options?: { NX?: boolean }) => { if (options?.NX && kv.has(key)) return null; kv.set(key, value); return 'OK'; }),
    del: vi.fn(async (key: string) => kv.delete(key)),
    get: vi.fn(async (key: string) => kv.get(key) ?? null),
    exists: vi.fn(async () => 0)
  }
}));
vi.mock('../jobs/queues.js', () => ({ QUEUES: { calls: 'calls' }, addJob: vi.fn(), jobQueue: () => ({ getJob: vi.fn(async () => null) }) }));
const emitted = vi.hoisted(() => [] as Array<[string, string, any]>);
vi.mock('../services/notification.service.js', () => ({ emitUserEvent: (user: string, event: string, payload: any) => emitted.push([user, event, payload]), notify: vi.fn() }));
vi.mock('../services/message.service.js', () => ({ conversationForFriend: vi.fn(), countUnreadConversations: vi.fn(async () => 0) }));

import { Call, Conversation, Message, User } from '../models/index.js';
import { acceptCall, finishCall, joinCall, startCall } from '../services/call.service.js';
import { conversationForFriend } from '../services/message.service.js';
import { notify } from '../services/notification.service.js';

const CALLER = 'a'.repeat(24), CALLEE = 'b'.repeat(24), CONV = 'c'.repeat(24);
const person = (id: string) => ({ select: () => ({ lean: async () => ({ _id: id, displayName: 'Person', username: 'person' }) }) });
const callRow = (fields: Record<string, unknown> = {}) => ({ _id: 'd'.repeat(24), id: 'd'.repeat(24), callerId: CALLER, calleeId: CALLEE, conversationId: CONV, kind: 'video', status: 'accepted', roomName: 'call_room', answeredAt: new Date(), createdAt: new Date(), ...fields });

beforeEach(() => {
  vi.restoreAllMocks(); kv.clear(); emitted.length = 0;
  vi.mocked(conversationForFriend).mockResolvedValue({ memberIds: [CALLER, CALLEE] } as any);
  vi.spyOn(User, 'findById').mockImplementation(((id: string) => person(id)) as any);
});

describe('starting a call', () => {
  it('rings the other person', async () => {
    vi.spyOn(Call, 'create').mockResolvedValue(callRow({ status: 'ringing' }) as any);
    const result = await startCall(CALLER, CONV, 'audio');
    expect(result.callId).toBe('d'.repeat(24));
    expect(emitted).toContainEqual([CALLEE, 'call:incoming', expect.objectContaining({ kind: 'audio' })]);
  });

  it('never hands the caller a room token before an answer', async () => {
    vi.spyOn(Call, 'create').mockResolvedValue(callRow({ status: 'ringing' }) as any);
    expect(await startCall(CALLER, CONV, 'audio')).not.toHaveProperty('token');
  });

  it('refuses strangers and blocked people', async () => {
    vi.mocked(conversationForFriend).mockRejectedValue(new Error('Only friends can chat.'));
    const create = vi.spyOn(Call, 'create');
    await expect(startCall(CALLER, CONV, 'audio')).rejects.toThrow('Only friends');
    expect(create).not.toHaveBeenCalled();
  });

  it('says busy, and frees the caller again, when the other person is on a call', async () => {
    kv.set(`call:busy:${CALLEE}`, 'call');
    await expect(startCall(CALLER, CONV, 'audio')).rejects.toMatchObject({ code: 'USER_BUSY' });
    expect(kv.has(`call:busy:${CALLER}`)).toBe(false);
  });

  it('refuses a second call from someone already on one', async () => {
    kv.set(`call:busy:${CALLER}`, 'call');
    await expect(startCall(CALLER, CONV, 'audio')).rejects.toMatchObject({ code: 'ALREADY_IN_CALL' });
  });
});

describe('room tokens', () => {
  it('only opens the one room, and a voice call cannot publish a camera', async () => {
    vi.spyOn(Call, 'findOne').mockResolvedValue(callRow({ kind: 'audio' }) as any);
    const { token } = await joinCall(CALLER, 'd'.repeat(24));
    const claims = jwtDecode(token);
    expect(claims.sub).toBe(CALLER);
    expect(claims.video.room).toBe('call_room');
    expect(claims.video.roomAdmin).toBeUndefined();
    expect(claims.video.canPublishSources.join()).not.toMatch(/camera/i);
  });

  it('allows a camera on a video call', async () => {
    vi.spyOn(Call, 'findOne').mockResolvedValue(callRow({ kind: 'video' }) as any);
    const claims = jwtDecode((await joinCall(CALLER, 'd'.repeat(24))).token);
    expect(claims.video.canPublishSources.join()).toMatch(/camera/i);
  });

  it('are not issued to people outside the call or after it ended', async () => {
    vi.spyOn(Call, 'findOne').mockResolvedValueOnce(null).mockResolvedValueOnce(callRow({ status: 'ended' }) as any);
    await expect(joinCall('e'.repeat(24), 'd'.repeat(24))).rejects.toMatchObject({ status: 404 });
    await expect(joinCall(CALLER, 'd'.repeat(24))).rejects.toMatchObject({ code: 'CALL_ENDED' });
  });
});

describe('answering', () => {
  it('fails once the call is over, and only the callee can answer', async () => {
    const update = vi.spyOn(Call, 'findOneAndUpdate').mockResolvedValue(null);
    await expect(acceptCall(CALLER, 'd'.repeat(24))).rejects.toMatchObject({ code: 'CALL_ENDED' });
    expect(update.mock.calls[0]![0]).toMatchObject({ calleeId: CALLER, status: 'ringing' });
  });
});

describe('ending', () => {
  const settle = (row: any) => {
    vi.spyOn(Call, 'findOneAndUpdate').mockResolvedValue(row);
    vi.spyOn(Message, 'create').mockResolvedValue({ populate: vi.fn(), toObject: () => ({ content: 'x' }) } as any);
    vi.spyOn(Conversation, 'updateOne').mockResolvedValue({} as any);
  };

  it('frees both people and tells them', async () => {
    kv.set(`call:busy:${CALLER}`, 'call'); kv.set(`call:busy:${CALLEE}`, 'call');
    settle(callRow());
    await finishCall(callRow(), 'ended', 'hung_up');
    expect(kv.size).toBe(0);
    expect(emitted.filter(([, event]) => event === 'call:ended').map(([user]) => user).sort()).toEqual([CALLER, CALLEE]);
  });

  it('does nothing when a racing hang-up already finished it', async () => {
    settle(null);
    const create = vi.mocked(Message.create);
    await finishCall(callRow(), 'ended', 'hung_up');
    expect(create).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });

  it('notifies the callee of a missed call only', async () => {
    settle(callRow({ status: 'missed' }));
    await finishCall(callRow(), 'missed', 'no_answer');
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ recipientId: CALLEE, type: 'missed_call' }));
  });
});
