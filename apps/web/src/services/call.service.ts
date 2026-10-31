import crypto from 'node:crypto';
import { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } from 'livekit-server-sdk';
import { redis } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { addJob, jobQueue, QUEUES } from '../jobs/queues.js';
import { Call, Conversation, Message, User } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { conversationForFriend, countUnreadConversations } from './message.service.js';
import { emitUserEvent, notify } from './notification.service.js';

/**
 * One-to-one calls. The server owns the call's state and rings over Socket.IO; LiveKit only carries the media,
 * and a person gets a room token only once the call has been answered.
 */
const RING_MS = 40_000;
// Both sides must be in the room this long after answering, or the call has failed.
const CONNECT_MS = 45_000;
const JOIN_TOKEN_TTL = '2m';
const RING_BUSY_SECONDS = 90;
// Safety net so a lost webhook can't mark someone busy forever.
const IN_CALL_BUSY_SECONDS = 6 * 3600;
const PERSON = 'username displayName profile.avatarUrl';

export const callsEnabled = () => !!(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);

const busyKey = (userId: unknown) => `call:busy:${userId}`;
const others = (call: any, userId: string) => (String(call.callerId) === userId ? String(call.calleeId) : String(call.callerId));

function assertEnabled() {
  if (!callsEnabled()) throw new AppError(503, 'Calling is not available right now.', 'CALLS_DISABLED');
}

async function participant(callId: string, userId: string) {
  const call = await Call.findOne({ _id: callId, $or: [{ callerId: userId }, { calleeId: userId }] });
  if (!call) throw new AppError(404, 'Call not found.', 'NOT_FOUND');
  return call;
}

export async function startCall(callerId: string, conversationId: string, kind: 'audio' | 'video') {
  assertEnabled();
  // Friends only, which also rules out anyone blocked in either direction.
  const conversation = await conversationForFriend(callerId, conversationId);
  const calleeId = conversation.memberIds.map(String).find((id: string) => id !== callerId)!;
  if (!(await redis.set(busyKey(callerId), 'ringing', { NX: true, EX: RING_BUSY_SECONDS }))) throw new AppError(409, 'You are already on a call.', 'ALREADY_IN_CALL');
  if (!(await redis.set(busyKey(calleeId), 'ringing', { NX: true, EX: RING_BUSY_SECONDS }))) {
    await redis.del(busyKey(callerId));
    throw new AppError(409, 'They are on another call. Try again later.', 'USER_BUSY');
  }
  const call = await Call.create({ callerId, calleeId, conversationId, kind, status: 'ringing', roomName: `call_${crypto.randomUUID()}` });
  const [caller, callee]: any[] = await Promise.all([User.findById(callerId).select(PERSON).lean(), User.findById(calleeId).select(PERSON).lean()]);
  emitUserEvent(calleeId, 'call:incoming', { callId: call.id, kind, conversationId, person: summary(caller) });
  await addJob(QUEUES.calls, 'ring-timeout', { callId: call.id }, { delay: RING_MS, jobId: `ring-${call.id}`, attempts: 3 });
  return { callId: call.id, kind, person: summary(callee) };
}

const summary = (person: any) => ({ id: String(person?._id), displayName: person?.displayName || 'Oremus member', username: person?.username || '', avatarUrl: person?.profile?.avatarUrl || '' });

/** A room token for exactly this call and nothing else. A voice call's token cannot publish a camera. */
async function joinDetails(call: any, userId: string) {
  const person: any = await User.findById(userId).select('displayName').lean();
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity: userId, name: person?.displayName, ttl: JOIN_TOKEN_TTL });
  token.addGrant({
    roomJoin: true,
    room: call.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources: call.kind === 'video' ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : [TrackSource.MICROPHONE]
  });
  return { callId: String(call._id), kind: call.kind, url: env.LIVEKIT_URL, token: await token.toJwt() };
}

export async function acceptCall(userId: string, callId: string) {
  assertEnabled();
  const call = await Call.findOneAndUpdate({ _id: callId, calleeId: userId, status: 'ringing' }, { status: 'accepted', answeredAt: new Date() }, { new: true });
  if (!call) throw new AppError(409, 'This call has ended.', 'CALL_ENDED');
  await Promise.all([redis.set(busyKey(call.callerId), 'call', { EX: IN_CALL_BUSY_SECONDS }), redis.set(busyKey(call.calleeId), 'call', { EX: IN_CALL_BUSY_SECONDS })]);
  await removeJob(`ring-${call.id}`);
  await addJob(QUEUES.calls, 'connect-timeout', { callId: call.id }, { delay: CONNECT_MS, jobId: `connect-${call.id}`, attempts: 3 });
  emitUserEvent(String(call.callerId), 'call:accepted', { callId: call.id });
  // The callee's other tabs and devices stop ringing.
  emitUserEvent(userId, 'call:answered-elsewhere', { callId: call.id });
  return joinDetails(call, userId);
}

/** Gets a fresh token, for the caller once answered and for anyone rejoining after a reload. */
export async function joinCall(userId: string, callId: string) {
  assertEnabled();
  const call = await participant(callId, userId);
  if (call.status !== 'accepted') throw new AppError(409, 'This call has ended.', 'CALL_ENDED');
  return joinDetails(call, userId);
}

export async function declineCall(userId: string, callId: string) {
  const call = await Call.findOne({ _id: callId, calleeId: userId, status: 'ringing' });
  if (!call) return;
  await finishCall(call, 'declined', 'declined');
}

/** Hanging up. Before an answer that is the caller cancelling, which the other side sees as a missed call. */
export async function endCall(userId: string, callId: string) {
  const call = await participant(callId, userId);
  if (call.status === 'ringing') await finishCall(call, String(call.callerId) === userId ? 'missed' : 'declined', 'hung_up');
  else if (call.status === 'accepted') await finishCall(call, 'ended', 'hung_up');
}

/** Anything ringing or connected that this person is part of, so a reloaded page can pick the call back up. */
export async function activeCall(userId: string) {
  const call: any = await Call.findOne({ status: { $in: ['ringing', 'accepted'] }, $or: [{ callerId: userId }, { calleeId: userId }] }).sort({ createdAt: -1 }).lean();
  if (!call) return null;
  const person: any = await User.findById(others(call, userId)).select(PERSON).lean();
  return { callId: String(call._id), kind: call.kind, status: call.status, conversationId: String(call.conversationId), incoming: String(call.calleeId) === userId, person: summary(person) };
}

const removeJob = async (jobId: string) => {
  try { await (await jobQueue(QUEUES.calls).getJob(jobId))?.remove(); }
  catch (error) { logger.warn({ error, jobId }, 'Could not remove call job'); }
};

const minutes = (ms: number) => { const total = Math.max(1, Math.round(ms / 60_000)); return `${total} min`; };

function summaryText(call: any, status: string): string {
  const label = call.kind === 'video' ? 'video call' : 'voice call';
  if (status === 'missed') return `Missed ${label}`;
  if (status === 'declined') return `Declined ${label}`;
  if (status === 'failed') return `${label[0]!.toUpperCase()}${label.slice(1)} could not connect`;
  return `${label[0]!.toUpperCase()}${label.slice(1)} · ${minutes(Date.now() - new Date(call.answeredAt || call.createdAt).getTime())}`;
}

/** The single way a call ends. The status check makes it safe for hang-ups, webhooks and timeouts to race. */
export async function finishCall(call: any, status: 'declined' | 'missed' | 'ended' | 'failed', reason: string): Promise<void> {
  const claimed = await Call.findOneAndUpdate({ _id: call._id, status: { $in: ['ringing', 'accepted'] } }, { status, endReason: reason, endedAt: new Date() }, { new: true });
  if (!claimed) return;
  await Promise.all([redis.del(busyKey(claimed.callerId)), redis.del(busyKey(claimed.calleeId)), removeJob(`ring-${claimed.id}`), removeJob(`connect-${claimed.id}`)]);
  const callerId = String(claimed.callerId), calleeId = String(claimed.calleeId);
  for (const userId of [callerId, calleeId]) emitUserEvent(userId, 'call:ended', { callId: claimed.id, status });
  closeRoom(claimed.roomName);
  const message = await Message.create({ conversationId: claimed.conversationId, senderId: callerId, content: summaryText(claimed, status), kind: 'call', callId: claimed._id, readBy: [callerId] });
  await Conversation.updateOne({ _id: claimed.conversationId }, { lastMessageAt: new Date() });
  await message.populate('senderId', PERSON);
  const payload = message.toObject();
  await Promise.all([callerId, calleeId].map(async (userId) => emitUserEvent(userId, 'message:new', { ...payload, unreadMessages: await countUnreadConversations(userId) })));
  if (status === 'missed') await notify({ recipientId: calleeId, actorId: callerId, type: 'missed_call', entityType: 'Conversation', entityId: String(claimed.conversationId), text: claimed.kind === 'video' ? 'tried to video call you' : 'tried to call you' });
}

/** Removes the room so nobody can stay connected after the call is over. Best effort: rooms also close when empty. */
function closeRoom(roomName: string): void {
  if (!callsEnabled()) return;
  const host = env.LIVEKIT_HOST || env.LIVEKIT_URL.replace(/^ws/, 'http');
  new RoomServiceClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET).deleteRoom(roomName).catch(() => undefined);
}

/** Blocking someone or losing an account ends their calls immediately. */
export async function endCallsBetween(firstId: string, secondId: string): Promise<void> {
  const calls = await Call.find({ status: { $in: ['ringing', 'accepted'] }, $or: [{ callerId: firstId, calleeId: secondId }, { callerId: secondId, calleeId: firstId }] });
  await Promise.all(calls.map((call: any) => finishCall(call, 'ended', 'blocked')));
}

export async function endCallsOf(userId: string): Promise<void> {
  const calls = await Call.find({ status: { $in: ['ringing', 'accepted'] }, $or: [{ callerId: userId }, { calleeId: userId }] });
  await Promise.all(calls.map((call: any) => finishCall(call, 'ended', 'account_restricted')));
}

/* ---------- Background ---------- */

export async function onRingTimeout(callId: string): Promise<void> {
  const call = await Call.findOne({ _id: callId, status: 'ringing' });
  if (call) await finishCall(call, 'missed', 'no_answer');
}

export async function onConnectTimeout(callId: string): Promise<void> {
  const call = await Call.findOne({ _id: callId, status: 'accepted' });
  if (call && (call.joinedIds || []).length < 2) await finishCall(call, 'failed', 'never_connected');
}

/* ---------- LiveKit webhooks ---------- */

/** Signed by LiveKit. This is how a call ends when someone's browser crashes or their network drops for good. */
export async function handleLivekitWebhook(rawBody: string, authorization: string | undefined): Promise<void> {
  const receiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  const event = await receiver.receive(rawBody, authorization);
  const roomName = event.room?.name;
  if (!roomName) return;
  if (event.event === 'participant_joined' && event.participant?.identity) {
    await Call.updateOne({ roomName, status: 'accepted' }, { $addToSet: { joinedIds: event.participant.identity } });
    return;
  }
  if (event.event === 'participant_left' || event.event === 'room_finished') {
    const call = await Call.findOne({ roomName, status: 'accepted' });
    if (call) await finishCall(call, 'ended', event.event);
  }
}
