import { redis } from '../config/database.js';

const FEED_VERSION_KEY = 'cache:version:feed';

export async function cacheGet<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  // Diagnostics must not add another Redis round trip to every cached request.
  void redis.hIncrBy('cache:stats', value ? 'hits' : 'misses', 1).catch(() => undefined);
  return value ? JSON.parse(value) as T : null;
}

export async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), { EX: ttl });
}

export async function invalidateCacheKeys(keys: string[]): Promise<void> {
  const unique = [...new Set(keys)];
  if (unique.length) await redis.del(unique);
}

export async function invalidateByPrefix(prefix: string): Promise<void> {
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, { MATCH: `${prefix}*`, COUNT: 100 });
    cursor = result.cursor;
    if (result.keys.length) await redis.del(result.keys);
  } while (cursor !== '0');
}

/** Feed keys include this generation, making global invalidation a single O(1) INCR. */
export async function feedCacheVersion(): Promise<string> {
  return (await redis.get(FEED_VERSION_KEY)) || '0';
}

export async function invalidateFeedCaches(): Promise<void> {
  await redis.incr(FEED_VERSION_KEY);
}

export async function invalidateProfileCaches(userIds: string[] = []): Promise<void> {
  await invalidateCacheKeys(userIds.map((id) => `profile:${id}`));
}

export async function invalidateSearchCaches(): Promise<void> {
  await invalidateByPrefix('search:');
}

/**
 * Social writes always refresh feeds and affected profile summaries. Search is opt-in because
 * reactions, comments, follows and membership changes do not alter indexed search content.
 */
export async function invalidateSocialCaches(userIds: string[] = [], options: { search?: boolean } = {}): Promise<void> {
  await Promise.all([
    invalidateFeedCaches(),
    invalidateProfileCaches(userIds),
    // Suggestions depend on who you follow, block and engage with (see recommendation.service.ts).
    invalidateCacheKeys(userIds.map((id) => `rec:${id}`)),
    ...(options.search ? [invalidateSearchCaches()] : [])
  ]);
}

export async function cacheStats(): Promise<Record<string, number>> {
  const raw = await redis.hGetAll('cache:stats');
  const hits = Number(raw.hits || 0), misses = Number(raw.misses || 0);
  return { hits, misses, total: hits + misses, hitRate: hits + misses ? Math.round((hits / (hits + misses)) * 1000) / 10 : 0 };
}
