import { AppError } from '../utils/errors.js';

export function assertOwner(ownerId: unknown, actorId: string, message = 'You do not own this resource.'): void {
  if (String(ownerId) !== actorId) throw new AppError(403, message, 'NOT_OWNER');
}

type AccountState = { status?: string | null; suspendedUntil?: Date | string | null };

/** Why this account may not use the app right now, or null. A suspension simply lapses when its date passes. */
export function accountRestriction(user: AccountState): 'banned' | 'suspended' | null {
  if (user.status === 'banned') return 'banned';
  if (user.status !== 'suspended') return null;
  return !user.suspendedUntil || new Date(user.suspendedUntil).getTime() > Date.now() ? 'suspended' : null;
}

export const isStaff = (user: { role?: string | null } | null | undefined) => user?.role === 'moderator' || user?.role === 'admin';
