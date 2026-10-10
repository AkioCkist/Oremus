import { redis } from '../config/database.js';

export async function cacheGet<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  await redis.hIncrBy('cache:stats', value ? 'hits' : 'misses', 1);
  return value ? JSON.parse(value) as T : null;
}

export async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), { EX: ttl });
}

export async function invalidateByPrefix(prefix: string): Promise<void> {
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, { MATCH: `${prefix}*`, COUNT: 100 });
    cursor = result.cursor;
    if (result.keys.length) await redis.del(result.keys);
  } while (cursor !== '0');
}

export async function invalidateSocialCaches(userIds: string[] = []): Promise<void> {
  await Promise.all([invalidateByPrefix('feed:'), invalidateByPrefix('search:'), ...userIds.map((id) => invalidateByPrefix(`profile:${id}`))]);
}

export async function cacheStats(): Promise<Record<string, number>> {
  const raw = await redis.hGetAll('cache:stats');
  const hits = Number(raw.hits || 0), misses = Number(raw.misses || 0);
  return { hits, misses, total: hits + misses, hitRate: hits + misses ? Math.round((hits / (hits + misses)) * 1000) / 10 : 0 };
}
