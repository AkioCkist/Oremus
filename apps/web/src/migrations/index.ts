import { friendshipExistingChats } from './001-friendship-existing-chats.js';
import type { Migration } from './types.js';

export type { Migration } from './types.js';

/**
 * Every data migration, oldest first. To add one: copy `_template.ts` to `NNN-short-name.ts`,
 * fill it in, and append it here. Index changes need no migration: `migrate` syncs every model's indexes.
 */
export const migrations: Migration[] = [
  friendshipExistingChats
];
