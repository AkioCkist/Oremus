import { AppError } from '../utils/errors.js';

export function assertOwner(ownerId: unknown, actorId: string, message = 'You do not own this resource.'): void {
  if (String(ownerId) !== actorId) throw new AppError(403, message, 'NOT_OWNER');
}
