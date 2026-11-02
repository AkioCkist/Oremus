import mongoose from 'mongoose';
import { redis } from '../config/database.js';
import { env } from '../config/env.js';
import { jobQueue, QUEUES } from '../jobs/queues.js';
import { MEDIA_TRASH, VIDEO_ACTIVE, VIDEO_JOBS } from '../media/queue.js';
import { User } from '../models/index.js';
import { GRANULARITY, SERVERS_KEY, bucketKey, bucketOf, maxKey, metaKey, seriesKey, splitField, thresholds, type Granularity, type Metric } from './recorder.js';

/*
 * Reads what the recorders wrote for a period and adds live readings from Redis, MongoDB and the queues.
 * One snapshot per period is reused for a few seconds, so several open monitoring tabs cost the same as one.
 */

export const PERIODS = {
  '1h': { granularity: 'm', buckets: 60 },
  '6h': { granularity: 'm', buckets: 360 },
  '24h': { granularity: 'h', buckets: 24 },
  '7d': { granularity: 'h', buckets: 168 }
} as const satisfies Record<string, { granularity: Granularity; buckets: number }>;
export type Period = keyof typeof PERIODS;
export const isPeriod = (value: unknown): value is Period => typeof value === 'string' && value in PERIODS;

export type Totals = { count: number; sum: number; slow: number; error: number; hit: number; miss: number; max: number };
const empty = (): Totals => ({ count: 0, sum: 0, slow: 0, error: 0, hit: 0, miss: 0, max: 0 });
const OFFLINE_AFTER_MS = 60_000;
const FORGET_AFTER_MS = 6 * 3600_000;
const CHART_POINTS = 60;
const SNAPSHOT_MS = 5_000;

/** Adds one bucket hash (fields are "key<US>stat", see recorder.ts) into per-key totals. */
export function addBucket(target: Map<string, Totals>, hash: Record<string, string>): void {
  for (const [raw, value] of Object.entries(hash)) {
    const [key, stat] = splitField(raw);
    const totals = target.get(key) ?? empty();
    if (stat in totals) totals[stat as keyof Totals] += Number(value) || 0;
    target.set(key, totals);
  }
}

async function readMetric(metric: Metric, granularity: Granularity, buckets: number[], seriesKeyFilter: (key: string) => boolean) {
  const [hashes, maxima] = await Promise.all([
    Promise.all(buckets.map((bucket) => redis.hGetAll(bucketKey(granularity, bucket, metric)))),
    Promise.all(buckets.map((bucket) => redis.zRangeWithScores(maxKey(granularity, bucket, metric), 0, -1)))
  ]);
  const totals = new Map<string, Totals>();
  const series = buckets.map((bucket, index) => {
    const point = { t: bucket * GRANULARITY[granularity].seconds * 1000, ...empty() };
    const one = new Map<string, Totals>();
    addBucket(one, hashes[index] as Record<string, string>);
    for (const [key, value] of one) {
      if (seriesKeyFilter(key)) for (const stat of ['count', 'sum', 'slow', 'error', 'hit', 'miss'] as const) point[stat] += value[stat];
    }
    addBucket(totals, hashes[index] as Record<string, string>);
    for (const { value, score } of maxima[index] ?? []) {
      const entry = totals.get(value) ?? empty();
      entry.max = Math.max(entry.max, score);
      totals.set(value, entry);
      if (seriesKeyFilter(value)) point.max = Math.max(point.max, score);
    }
    return point;
  });
  return { totals, series: downsample(series) };
}

/** Merges neighbouring buckets so a chart never has more than CHART_POINTS bars. */
function downsample<T extends Totals & { t: number }>(series: T[]): T[] {
  if (series.length <= CHART_POINTS) return series;
  const size = Math.ceil(series.length / CHART_POINTS);
  const out: T[] = [];
  for (let index = 0; index < series.length; index += size) {
    const chunk = series.slice(index, index + size);
    const merged = { ...chunk[0]! };
    for (const point of chunk.slice(1)) {
      for (const stat of ['count', 'sum', 'slow', 'error', 'hit', 'miss'] as const) merged[stat] += point[stat];
      merged.max = Math.max(merged.max, point.max);
    }
    out.push(merged);
  }
  return out;
}

const avg = (totals: Totals) => (totals.count ? Math.round(totals.sum / totals.count) : 0);
const rows = (totals: Map<string, Totals>, filter: (key: string) => boolean = (key) => !key.startsWith('_')) =>
  [...totals].filter(([key]) => filter(key)).map(([key, value]) => ({ key, ...value, avg: avg(value) }));
const top = <T>(items: T[], sort: (a: T, b: T) => number, limit = 10) => [...items].sort(sort).slice(0, limit);
const sumAll = (totals: Map<string, Totals>, filter: (key: string) => boolean = (key) => !key.startsWith('_')) => {
  const all = empty();
  for (const [key, value] of totals) if (filter(key)) for (const stat of Object.keys(all) as (keyof Totals)[]) all[stat] = stat === 'max' ? Math.max(all.max, value.max) : all[stat] + value[stat];
  return all;
};

async function readMeta(metric: Metric, keys: string[]) {
  if (!keys.length) return {} as Record<string, any>;
  const values = await redis.hmGet(metaKey(metric), keys);
  return Object.fromEntries(keys.map((key, index) => { try { return [key, values[index] ? JSON.parse(values[index] as string) : null]; } catch { return [key, null]; } }));
}

/* ---------- Live readings ---------- */

export function parseRedisInfo(text: string) {
  const info: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf(':');
    if (at > 0) info[line.slice(0, at)] = line.slice(at + 1);
  }
  return info;
}

async function redisHealth() {
  try {
    const started = performance.now();
    await redis.ping();
    const latency = performance.now() - started;
    const info = parseRedisInfo(await redis.info());
    const n = (key: string) => Number(info[key] || 0);
    const keyspace = Object.entries(info).filter(([key]) => /^db\d+$/.test(key)).reduce((total, [, value]) => total + Number(/keys=(\d+)/.exec(value)?.[1] || 0), 0);
    const hits = n('keyspace_hits'), misses = n('keyspace_misses');
    return {
      ok: true, latency: Math.round(latency * 10) / 10, version: info.redis_version, uptime: n('uptime_in_seconds'), mode: info.redis_mode,
      clients: n('connected_clients'), blockedClients: n('blocked_clients'),
      memory: { used: n('used_memory'), peak: n('used_memory_peak'), rss: n('used_memory_rss'), max: n('maxmemory'), fragmentation: Number(info.mem_fragmentation_ratio || 0), policy: info.maxmemory_policy },
      opsPerSec: n('instantaneous_ops_per_sec'), commands: n('total_commands_processed'),
      hits, misses, hitRate: hits + misses ? Math.round((hits / (hits + misses)) * 1000) / 10 : null,
      evicted: n('evicted_keys'), expired: n('expired_keys'), keys: keyspace,
      persistence: { aof: info.aof_enabled === '1', lastSave: n('rdb_last_save_time') * 1000, lastSaveOk: info.rdb_last_bgsave_status === 'ok' }
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

async function mongoHealth(detailed = true) {
  const db = mongoose.connection.db;
  if (!db || mongoose.connection.readyState !== 1) return { ok: false, error: 'Not connected' };
  try {
    const started = performance.now();
    await db.admin().ping();
    const latency = performance.now() - started;
    const [status, stats, collections, current] = await Promise.all([
      db.admin().serverStatus().catch(() => null),
      db.stats().catch(() => null),
      detailed ? db.listCollections({}, { nameOnly: true }).toArray().catch(() => [] as Array<{ name: string }>) : Promise.resolve([] as Array<{ name: string }>),
      detailed ? db.admin().command({ currentOp: 1, active: true, secs_running: { $gte: 1 } }).catch(() => null) : Promise.resolve(null)
    ]);
    const sizes = (await Promise.all(collections.filter((item) => !item.name.startsWith('system.')).map(async ({ name }) => {
      try {
        const row: any = await db.collection(name).aggregate([{ $collStats: { storageStats: {} } }]).next();
        const storage = row?.storageStats || {};
        return { name, count: storage.count ?? 0, size: storage.size ?? 0, storage: storage.storageSize ?? 0, indexes: storage.totalIndexSize ?? 0, indexCount: storage.nindexes ?? 0 };
      } catch { return null; }
    }))).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const ops = (current?.inprog || []).filter((op: any) => op.ns && !String(op.ns).startsWith('admin.') && op.op !== 'none');
    return {
      ok: true, latency: Math.round(latency * 10) / 10,
      version: status?.version, uptime: status?.uptime, host: status?.host,
      connections: status?.connections ? { current: status.connections.current, available: status.connections.available, active: status.connections.active } : null,
      opcounters: status?.opcounters ?? null,
      network: status?.network ? { in: Number(status.network.bytesIn), out: Number(status.network.bytesOut), requests: Number(status.network.numRequests) } : null,
      memory: status?.mem ? { resident: status.mem.resident * 1024 * 1024, virtual: status.mem.virtual * 1024 * 1024 } : null,
      cache: status?.wiredTiger?.cache ? { used: status.wiredTiger.cache['bytes currently in the cache'], max: status.wiredTiger.cache['maximum bytes configured'] } : null,
      database: stats ? { name: stats.db, collections: stats.collections, objects: stats.objects, data: stats.dataSize, storage: stats.storageSize, indexes: stats.indexSize, indexCount: stats.indexes } : null,
      collections: sizes.sort((a, b) => (b.size + b.indexes) - (a.size + a.indexes)).slice(0, 60),
      running: ops.slice(0, 25).map((op: any) => ({ ns: op.ns, op: op.op, secs: op.secs_running, plan: op.planSummary || '' })),
      runningCount: ops.length
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

async function queues() {
  const bull = await Promise.all(Object.values(QUEUES).map(async (name) => {
    try {
      const counts = await jobQueue(name).getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
      return { name, ...counts };
    } catch { return { name, unavailable: true }; }
  }));
  const [videoWaiting, videoActive, trash] = await Promise.all([redis.lLen(VIDEO_JOBS), redis.lLen(VIDEO_ACTIVE), redis.zCard(MEDIA_TRASH)]).catch(() => [0, 0, 0]);
  return [...bull, { name: 'media', waiting: videoWaiting, active: videoActive, delayed: 0, failed: 0, completed: 0, trash }];
}

async function servers() {
  const raw = await redis.hGetAll(SERVERS_KEY);
  const now = Date.now();
  const list: any[] = [];
  const forget: string[] = [];
  for (const [id, json] of Object.entries(raw)) {
    try {
      const server = JSON.parse(json);
      if (now - server.at > FORGET_AFTER_MS) { forget.push(id); continue; }
      list.push({ ...server, online: now - server.at < OFFLINE_AFTER_MS });
    } catch { forget.push(id); }
  }
  // A container that was recreated comes back under a new hostname. Once a process of the same role has started
  // after the silent one's last heartbeat, the silent one was replaced rather than lost, so it is not an alert.
  for (const server of [...list]) {
    if (server.online || !list.some((other) => other.online && other.role === server.role && other.startedAt > server.at)) continue;
    list.splice(list.indexOf(server), 1);
    forget.push(server.id);
  }
  if (forget.length) await redis.hDel(SERVERS_KEY, forget).catch(() => undefined);
  const series = await Promise.all(list.map((server) => redis.lRange(seriesKey(server.id), 0, -1).catch(() => [] as string[])));
  list.forEach((server, index) => { server.series = series[index]!.map((item) => { try { return JSON.parse(item); } catch { return null; } }).filter(Boolean).reverse(); });
  const order = ['web', 'jobs', 'media'];
  return list.sort((a, b) => (order.indexOf(a.role) - order.indexOf(b.role)) || String(a.host).localeCompare(b.host));
}

/* ---------- Snapshots, one per monitoring page ---------- */

export const SECTIONS = ['overview', 'servers', 'requests', 'exceptions', 'database', 'cache', 'queues', 'outgoing', 'usage'] as const;
export type Section = typeof SECTIONS[number];
export const isSection = (value: unknown): value is Section => typeof value === 'string' && (SECTIONS as readonly string[]).includes(value);

const LIMIT = 100;
const all = () => true;
const hitRate = (hit: number, miss: number) => (hit + miss ? Math.round((hit / (hit + miss)) * 1000) / 10 : null);
const withAvg = (totals: Totals) => ({ ...totals, avg: avg(totals) });

function window(period: Period) {
  const { granularity, buckets: count } = PERIODS[period];
  const last = bucketOf(granularity, Date.now());
  return { granularity, buckets: Array.from({ length: count }, (_, index) => last - count + 1 + index) };
}

async function requestSection(granularity: Granularity, buckets: number[], limit: number) {
  const requests = await readMetric('requests', granularity, buckets, (key) => key === '_all');
  const total = requests.totals.get('_all') ?? empty();
  const statuses = Object.fromEntries(['2xx', '3xx', '4xx', '5xx'].map((group) => [group, requests.totals.get(`_status:${group}`)?.count ?? 0]));
  const list = rows(requests.totals);
  const slow = top(list.filter((row) => row.slow > 0 || row.error > 0), (a, b) => b.slow - a.slow || b.max - a.max, limit);
  const meta = await readMeta('requests', slow.map((row) => row.key));
  return {
    total: withAvg(total), statuses, series: requests.series, routes: list.length,
    slow: slow.map((row) => ({ ...row, meta: meta[row.key] })),
    busiest: top(list, (a, b) => b.count - a.count, limit),
    slowest: top(list, (a, b) => b.avg - a.avg, limit)
  };
}

async function exceptionSection(granularity: Granularity, buckets: number[], limit: number) {
  const exceptions = await readMetric('exceptions', granularity, buckets, all);
  const list = top(rows(exceptions.totals, all), (a, b) => b.count - a.count, limit);
  const meta = await readMeta('exceptions', list.map((row) => row.key));
  return { total: sumAll(exceptions.totals, all).count, kinds: exceptions.totals.size, series: exceptions.series, rows: list.map((row) => ({ ...row, meta: meta[row.key] })) };
}

async function querySection(granularity: Granularity, buckets: number[], limit: number) {
  const queries = await readMetric('queries', granularity, buckets, all);
  const list = rows(queries.totals, all);
  const slow = top(list.filter((row) => row.slow > 0), (a, b) => b.slow - a.slow || b.max - a.max, limit);
  const meta = await readMeta('queries', slow.map((row) => row.key));
  const byCollection = new Map<string, Totals>();
  for (const row of list) {
    const name = row.key.split('.')[0] || '?';
    const entry = byCollection.get(name) ?? empty();
    for (const stat of ['count', 'sum', 'slow', 'error'] as const) entry[stat] += row[stat];
    entry.max = Math.max(entry.max, row.max);
    byCollection.set(name, entry);
  }
  return {
    total: withAvg(sumAll(queries.totals, all)), series: queries.series, shapes: list.length,
    slow: slow.map((row) => ({ ...row, meta: meta[row.key] })),
    heaviest: top(list, (a, b) => b.sum - a.sum, limit),
    frequent: top(list, (a, b) => b.count - a.count, limit),
    collections: top(rows(byCollection, all), (a, b) => b.sum - a.sum, 60)
  };
}

async function cacheSection(granularity: Granularity, buckets: number[]) {
  const cache = await readMetric('cache', granularity, buckets, all);
  const total = sumAll(cache.totals, all);
  return {
    total: { ...total, rate: hitRate(total.hit, total.miss) }, series: cache.series,
    families: rows(cache.totals, all).map((row) => ({ ...row, rate: hitRate(row.hit, row.miss) })).sort((a, b) => (b.hit + b.miss) - (a.hit + a.miss))
  };
}

async function timedSection(metric: 'jobs' | 'outgoing', granularity: Granularity, buckets: number[], limit: number) {
  const data = await readMetric(metric, granularity, buckets, all);
  const list = rows(data.totals, all);
  return { total: withAvg(sumAll(data.totals, all)), series: data.series, rows: top(list, (a, b) => b.slow - a.slow || b.error - a.error || b.count - a.count, limit) };
}

async function usageSection(granularity: Granularity, buckets: number[], limit: number) {
  const users = await readMetric('users', granularity, buckets, () => false);
  const list = top(rows(users.totals, all), (a, b) => b.count - a.count, limit);
  const slowest = top(rows(users.totals, all).filter((row) => row.slow > 0), (a, b) => b.slow - a.slow, limit);
  const ids = [...new Set([...list, ...slowest].map((row) => row.key))].filter((id) => mongoose.isValidObjectId(id));
  const people = ids.length ? await User.find({ _id: { $in: ids } }).select('displayName username email profile.avatarUrl').lean() : [];
  const byId = new Map(people.map((person: any) => [String(person._id), person]));
  const withPerson = (row: ReturnType<typeof rows>[number]) => { const person: any = byId.get(row.key); return { ...row, id: row.key, name: person?.displayName, username: person?.username, email: person?.email, avatar: person?.profile?.avatarUrl || '' }; };
  return { active: users.totals.size, top: list.map(withPerson), slow: slowest.map(withPerson) };
}

async function collect(period: Period, section: Section) {
  const { granularity, buckets } = window(period);
  const base = { section, generatedAt: new Date().toISOString(), period, granularity, thresholds, environment: { node: process.version, env: env.NODE_ENV, uptime: Math.round(process.uptime()) } };
  switch (section) {
    case 'servers': return { ...base, servers: await servers() };
    case 'requests': return { ...base, requests: await requestSection(granularity, buckets, LIMIT) };
    case 'exceptions': return { ...base, exceptions: await exceptionSection(granularity, buckets, LIMIT) };
    case 'database': {
      const [queries, mongo] = await Promise.all([querySection(granularity, buckets, LIMIT), mongoHealth(true)]);
      return { ...base, queries, mongo };
    }
    case 'cache': {
      const [cache, redisInfo] = await Promise.all([cacheSection(granularity, buckets), redisHealth()]);
      return { ...base, cache, redis: redisInfo };
    }
    case 'queues': {
      const [jobs, queueRows] = await Promise.all([timedSection('jobs', granularity, buckets, LIMIT), queues()]);
      return { ...base, jobs, queues: queueRows };
    }
    case 'outgoing': return { ...base, outgoing: await timedSection('outgoing', granularity, buckets, LIMIT) };
    case 'usage': return { ...base, usage: await usageSection(granularity, buckets, 50) };
    default: {
      const [serverRows, requests, exceptions, queries, cache, jobs, outgoing, queueRows, redisInfo, mongo] = await Promise.all([
        servers(), requestSection(granularity, buckets, 5), exceptionSection(granularity, buckets, 5), querySection(granularity, buckets, 5),
        cacheSection(granularity, buckets), timedSection('jobs', granularity, buckets, 5), timedSection('outgoing', granularity, buckets, 5),
        queues(), redisHealth(), mongoHealth(false)
      ]);
      return { ...base, servers: serverRows, requests, exceptions, queries, cache: { ...cache, families: cache.families.slice(0, 5) }, jobs, outgoing, queues: queueRows, redis: redisInfo, mongo };
    }
  }
}

const snapshots = new Map<string, { at: number; data: Promise<Awaited<ReturnType<typeof collect>>> }>();

export function monitoringSnapshot(period: Period, section: Section = 'overview') {
  const key = `${section}:${period}`;
  const cached = snapshots.get(key);
  if (cached && Date.now() - cached.at < SNAPSHOT_MS) return cached.data;
  const data = collect(period, section);
  snapshots.set(key, { at: Date.now(), data });
  data.catch(() => snapshots.delete(key));
  return data;
}
