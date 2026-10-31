import { RefreshToken, User, USER_ROLES } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { audit } from './audit.service.js';
import { endCallsOf } from './call.service.js';
import { notifySystem, terminateUserSessions } from './notification.service.js';

/** Ends every session of a user right away: refresh tokens, then live sockets. Access tokens fail on their next request. */
async function endSessions(userId: string): Promise<void> {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
  terminateUserSessions(userId);
  await endCallsOf(userId);
}

async function target(actorId: string, userId: string) {
  if (actorId === userId) throw new AppError(400, 'You cannot change your own account this way.', 'SELF_ACTION');
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw new AppError(404, 'User not found.', 'NOT_FOUND');
  return user;
}

export async function suspendUser(actorId: string, userId: string, input: { until: Date; reason: string }, ip?: string) {
  const user = await target(actorId, userId);
  if (user.role === 'admin') throw new AppError(403, 'Administrators cannot be suspended.', 'FORBIDDEN');
  user.status = 'suspended'; user.suspendedUntil = input.until; user.restrictionReason = input.reason;
  await user.save(); await endSessions(userId);
  await audit('account.suspend', actorId, 'User', userId, { until: input.until, reason: input.reason }, ip);
  return user;
}

export async function banUser(actorId: string, userId: string, reason: string, ip?: string) {
  const user = await target(actorId, userId);
  if (user.role === 'admin') throw new AppError(403, 'Administrators cannot be banned.', 'FORBIDDEN');
  user.status = 'banned'; user.suspendedUntil = null; user.restrictionReason = reason;
  await user.save(); await endSessions(userId);
  await audit('account.ban', actorId, 'User', userId, { reason }, ip);
  return user;
}

export async function reinstateUser(actorId: string, userId: string, ip?: string) {
  const user = await target(actorId, userId);
  user.status = 'active'; user.suspendedUntil = null; user.restrictionReason = '';
  await user.save();
  await audit('account.reinstate', actorId, 'User', userId, {}, ip);
  return user;
}

export async function warnUser(actorId: string, userId: string, reason: string, ip?: string) {
  await target(actorId, userId);
  await notifySystem({ recipientId: userId, type: 'moderation', entityType: 'User', entityId: userId, text: `sent you a warning: ${reason}`.slice(0, 180) });
  await audit('account.warn', actorId, 'User', userId, { reason }, ip);
}

export async function setUserRole(actorId: string, userId: string, role: string, ip?: string) {
  if (!(USER_ROLES as readonly string[]).includes(role)) throw new AppError(422, 'Unknown role.', 'VALIDATION_ERROR');
  const user = await target(actorId, userId);
  const previous = user.role;
  user.role = role; await user.save();
  await audit('account.role', actorId, 'User', userId, { from: previous, to: role }, ip);
  return user;
}
