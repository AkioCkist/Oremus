import { pathToFileURL } from 'node:url';
import { redis } from '../config/database.js';
import { env } from '../config/env.js';

/**
 * Clears Redis so the app starts from cold caches.
 *
 * `wipe:cache -- --yes`        deletes cached reads and rate-limit counters only.
 *                              Revoked-token entries (`deny:*`) and the media queue are kept,
 *                              so logged-out tokens stay unusable and pending videos still process.
 * `wipe:cache -- --yes --all`  empties the whole Redis database (FLUSHDB): caches, rate limits,
 *                              revoked tokens and media jobs. Use together with `wipe:data`.
 * Refuses when NODE_ENV=production unless `--allow-production` is also given.
 */

// Every cache-like prefix written by the web app (src/services) and the FastAPI service.
export const CACHE_PREFIXES = ['cache:', 'feed:', 'profile:', 'group:', 'search:', 'places:', 'rate:'];

export type WipeCacheResult = { mode: 'caches' | 'all'; deleted: number | null };

async function deleteByPrefix(prefix: string): Promise<number> {
  let cursor = '0';
  let deleted = 0;
  do {
    const result = await redis.scan(cursor, { MATCH: `${prefix}*`, COUNT: 500 });
    cursor = result.cursor;
    // UNLINK frees memory in the background, so large wipes don't block other clients.
    if (result.keys.length) deleted += await redis.unlink(result.keys);
  } while (cursor !== '0');
  return deleted;
}

/** Expects `redis` to be connected. */
export async function wipeRedis(all: boolean): Promise<WipeCacheResult> {
  if (all) {
    await redis.flushDb();
    return { mode: 'all', deleted: null };
  }
  let deleted = 0;
  for (const prefix of CACHE_PREFIXES) deleted += await deleteByPrefix(prefix);
  return { mode: 'caches', deleted };
}

export function assertWipeAllowed(description: string): boolean {
  if (env.NODE_ENV === 'production' && !process.argv.includes('--allow-production')) {
    throw new Error('Refusing to wipe while NODE_ENV=production. Add --allow-production only if this really is a demo/test deployment.');
  }
  if (!process.argv.includes('--yes')) {
    console.error(`${description} Re-run with --yes to confirm.`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

export function describeCacheWipe(result: WipeCacheResult): string {
  return result.mode === 'all' ? 'Flushed the whole Redis database.' : `Deleted ${result.deleted} cache and rate-limit keys from Redis.`;
}

async function main() {
  const all = process.argv.includes('--all');
  const target = all ? `EVERY key in Redis ${env.REDIS_URL}` : `cached data and rate limits in Redis ${env.REDIS_URL}`;
  if (!assertWipeAllowed(`This deletes ${target}.`)) return;
  await redis.connect();
  console.log(describeCacheWipe(await wipeRedis(all)));
}

// Only run when executed directly; wipe-data.ts imports the helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(() => (redis.isOpen ? redis.quit() : undefined))
    .catch(async (error) => { console.error(error instanceof Error ? error.message : error); if (redis.isOpen) await redis.quit(); process.exit(1); });
}
