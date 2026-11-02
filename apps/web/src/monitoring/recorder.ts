import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { redis } from '../config/database.js';
import { env } from '../config/env.js';

/*
 * Pulse-style recorder (see docs/MONITORING.md). Every process (web, jobs, media) counts what it does in memory and
 * flushes the totals to Redis every few seconds, into one-minute buckets (kept a day) and one-hour buckets (kept a
 * week). Nothing here may slow down or break a request: recording is synchronous map arithmetic, and a failed flush
 * simply drops that batch.
 */

export type Metric = 'requests' | 'exceptions' | 'queries' | 'cache' | 'jobs' | 'outgoing' | 'users';
export type Stat = 'count' | 'sum' | 'slow' | 'error' | 'hit' | 'miss';
export type Granularity = 'm' | 'h';

export const GRANULARITY: Record<Granularity, { seconds: number; ttl: number }> = {
  m: { seconds: 60, ttl: 26 * 3600 },
  h: { seconds: 3600, ttl: 8 * 86_400 }
};
const META_TTL = 8 * 86_400;
const SERIES_LENGTH = 240; // 1 hour of 15-second samples
const FLUSH_MS = 5_000;
const HEARTBEAT_MS = 15_000;
// High-cardinality keys (a bug that puts ids in a route name, say) must not grow memory without bound.
const MAX_KEYS = 20_000;
const MAX_KEY_LENGTH = 200;

const SEP = '\u001f';
export const field = (key: string, stat: Stat) => `${key}${SEP}${stat}`;
export const splitField = (raw: string): [string, Stat] => { const at = raw.lastIndexOf(SEP); return [raw.slice(0, at), raw.slice(at + 1) as Stat]; };
export const bucketOf = (granularity: Granularity, ms: number) => Math.floor(ms / 1000 / GRANULARITY[granularity].seconds);
export const bucketKey = (granularity: Granularity, bucket: number, metric: Metric) => `pulse:${granularity}:${bucket}:${metric}`;
export const maxKey = (granularity: Granularity, bucket: number, metric: Metric) => `${bucketKey(granularity, bucket, metric)}:max`;
export const metaKey = (metric: Metric) => `pulse:meta:${metric}`;
export const SERVERS_KEY = 'pulse:servers';
export const seriesKey = (id: string) => `pulse:series:${id}`;

export const thresholds = {
  request: env.MONITORING_SLOW_REQUEST_MS,
  query: env.MONITORING_SLOW_QUERY_MS,
  job: env.MONITORING_SLOW_JOB_MS,
  outgoing: env.MONITORING_SLOW_OUTGOING_MS
};

export const monitoringWanted = () => (env.MONITORING_ENABLED ? env.MONITORING_ENABLED === 'true' : env.NODE_ENV !== 'test');

let enabled = false;
const counters = new Map<string, number>();
const maxima = new Map<string, number>();
const metas = new Map<string, string>();
const PART = '\u001e';

export const isMonitoring = () => enabled;

/** Adds to the counters of `key` under `metric`. `max` keeps the worst duration seen. */
export function record(metric: Metric, key: string, stats: Partial<Record<Stat, number>>, max?: number): void {
  if (!enabled) return;
  const safeKey = key.length > MAX_KEY_LENGTH ? `${key.slice(0, MAX_KEY_LENGTH - 1)}…` : key;
  for (const [stat, value] of Object.entries(stats) as [Stat, number][]) {
    if (!value) continue;
    const id = `${metric}${PART}${safeKey}${PART}${stat}`;
    const current = counters.get(id);
    if (current === undefined && counters.size >= MAX_KEYS) continue;
    counters.set(id, (current ?? 0) + Math.round(value));
  }
  if (max !== undefined) {
    const id = `${metric}${PART}${safeKey}`;
    const current = maxima.get(id);
    if (current === undefined && maxima.size >= MAX_KEYS) return;
    if (current === undefined || max > current) maxima.set(id, Math.round(max));
  }
}

/** Latest details about a key (an exception's stack, when a request was last slow...). Last write wins. */
export function recordMeta(metric: Metric, key: string, data: Record<string, unknown>): void {
  if (!enabled || (metas.size >= 2_000 && !metas.has(`${metric}${PART}${key}`))) return;
  metas.set(`${metric}${PART}${key.slice(0, MAX_KEY_LENGTH)}`, JSON.stringify(data));
}

export async function flush(now = Date.now()): Promise<void> {
  if (!counters.size && !maxima.size && !metas.size) return;
  const counted = [...counters]; const worst = [...maxima]; const details = [...metas];
  counters.clear(); maxima.clear(); metas.clear();
  if (!redis.isOpen) return;
  const multi = redis.multi();
  for (const granularity of Object.keys(GRANULARITY) as Granularity[]) {
    const bucket = bucketOf(granularity, now);
    const touched = new Set<string>();
    for (const [id, value] of counted) {
      const [metric, key, stat] = id.split(PART) as [Metric, string, Stat];
      const target = bucketKey(granularity, bucket, metric);
      multi.hIncrBy(target, field(key, stat), value);
      touched.add(target);
    }
    for (const [id, value] of worst) {
      const [metric, key] = id.split(PART) as [Metric, string];
      const target = maxKey(granularity, bucket, metric);
      multi.zAdd(target, [{ score: value, value: key }], { comparison: 'GT' });
      touched.add(target);
    }
    for (const key of touched) multi.expire(key, GRANULARITY[granularity].ttl);
  }
  const metaTouched = new Set<string>();
  for (const [id, json] of details) {
    const [metric, key] = id.split(PART) as [Metric, string];
    multi.hSet(metaKey(metric), key, json);
    metaTouched.add(metaKey(metric));
  }
  for (const key of metaTouched) multi.expire(key, META_TTL);
  await multi.execAsPipeline();
}

/* ---------- Server heartbeat ---------- */

let role = 'web';
let extras: () => Record<string, unknown> = () => ({});
const startedAt = Date.now();
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
let lastCpu = process.cpuUsage();
let lastAt = process.hrtime.bigint();
let lastHost = hostCpuTimes();

function hostCpuTimes() {
  return os.cpus().reduce((total, cpu) => {
    const times = cpu.times;
    total.idle += times.idle; total.all += times.user + times.nice + times.sys + times.idle + times.irq;
    return total;
  }, { idle: 0, all: 0 });
}

function readFirst(...files: string[]): string | null {
  for (const file of files) { try { return fs.readFileSync(file, 'utf8').trim(); } catch { /* not present */ } }
  return null;
}

/** Limits Docker (cgroup v2, then v1) places on this container. Null outside a container or when unlimited. */
export function containerLimits() {
  const memMax = readFirst('/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes');
  const memNow = readFirst('/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes');
  const cpuMax = readFirst('/sys/fs/cgroup/cpu.max');
  const memoryLimit = memMax && memMax !== 'max' && Number(memMax) < os.totalmem() * 4 ? Number(memMax) : null;
  let cpuLimit: number | null = null;
  if (cpuMax) { const [quota, period] = cpuMax.split(/\s+/); if (quota !== 'max' && Number(period) > 0) cpuLimit = Number(quota) / Number(period); }
  const pids = readFirst('/sys/fs/cgroup/pids.current');
  const pidsMax = readFirst('/sys/fs/cgroup/pids.max');
  return {
    container: fs.existsSync('/.dockerenv') || Boolean(memMax),
    memoryLimit,
    memoryUsage: memNow ? Number(memNow) : null,
    cpuLimit,
    pids: pids ? Number(pids) : null,
    pidsLimit: pidsMax && pidsMax !== 'max' ? Number(pidsMax) : null
  };
}

export const serverId = () => `${role}@${os.hostname()}`;

async function heartbeat(): Promise<void> {
  const now = process.hrtime.bigint();
  const elapsedMicros = Number(now - lastAt) / 1000;
  const cpu = process.cpuUsage(lastCpu);
  const host = hostCpuTimes();
  const limits = containerLimits();
  const cores = Math.max(0.1, Math.min(os.availableParallelism(), limits.cpuLimit ?? Infinity));
  const processCpu = elapsedMicros > 0 ? ((cpu.user + cpu.system) / elapsedMicros / cores) * 100 : 0;
  const hostCpu = host.all - lastHost.all > 0 ? (1 - (host.idle - lastHost.idle) / (host.all - lastHost.all)) * 100 : 0;
  lastCpu = process.cpuUsage(); lastAt = now; lastHost = host;

  const memory = process.memoryUsage();
  let disk: { total: number; free: number; path: string } | null = null;
  try {
    const dir = path.resolve(process.cwd(), 'uploads');
    const stats = await fs.promises.statfs(fs.existsSync(dir) ? dir : process.cwd());
    disk = { total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize, path: fs.existsSync(dir) ? 'uploads' : '.' };
  } catch { /* statfs unsupported */ }

  const snapshot = {
    id: serverId(), role, host: os.hostname(), pid: process.pid, node: process.version, platform: `${os.type()} ${os.release()}`,
    startedAt, at: Date.now(), uptime: Math.round(process.uptime()),
    cpu: { process: round(processCpu), host: round(hostCpu), cores: os.availableParallelism(), limit: limits.cpuLimit, load: os.loadavg().map(round) },
    memory: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, external: memory.external, systemTotal: os.totalmem(), systemFree: os.freemem(), limit: limits.memoryLimit, usage: limits.memoryUsage },
    eventLoop: { mean: round(loopDelay.mean / 1e6), p99: round(loopDelay.percentile(99) / 1e6), max: round(loopDelay.max / 1e6) },
    container: limits.container, pids: limits.pids, pidsLimit: limits.pidsLimit,
    disk,
    ...safeExtras()
  };
  loopDelay.reset();
  if (!redis.isOpen || !enabled) return;
  const sample = JSON.stringify({ t: snapshot.at, cpu: snapshot.cpu.process, mem: memory.rss, lag: snapshot.eventLoop.p99 });
  await redis.multi()
    .hSet(SERVERS_KEY, snapshot.id, JSON.stringify(snapshot))
    .lPush(seriesKey(snapshot.id), sample)
    .lTrim(seriesKey(snapshot.id), 0, SERIES_LENGTH - 1)
    .expire(seriesKey(snapshot.id), 86_400)
    .execAsPipeline();
}

function safeExtras() { try { return extras(); } catch { return {}; } }
const round = (value: number) => Math.round(value * 10) / 10;

/* ---------- Lifecycle ---------- */

let flushTimer: NodeJS.Timeout | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;
const hooks: Array<() => void> = [];

/** Registers code that wires up instrumentation once monitoring starts (see instrument.ts). */
export function onMonitoringStart(hook: () => void) { hooks.push(hook); }

export function startMonitoring(processRole: string, options: { extras?: () => Record<string, unknown> } = {}): void {
  if (enabled || !monitoringWanted()) return;
  enabled = true;
  role = processRole;
  if (options.extras) extras = options.extras;
  loopDelay.enable();
  flushTimer = setInterval(() => { flush().catch(() => undefined); }, FLUSH_MS);
  heartbeatTimer = setInterval(() => { heartbeat().catch(() => undefined); }, HEARTBEAT_MS);
  flushTimer.unref(); heartbeatTimer.unref();
  setTimeout(() => { heartbeat().catch(() => undefined); }, 1_000).unref();
  hooks.forEach((hook) => hook());
}

export async function stopMonitoring(): Promise<void> {
  if (!enabled) return;
  clearInterval(flushTimer); clearInterval(heartbeatTimer);
  await flush().catch(() => undefined);
  // A clean stop is not an outage: leave the server list instead of turning up as "silent" for hours.
  if (redis.isOpen) await redis.multi().hDel(SERVERS_KEY, serverId()).del(seriesKey(serverId())).execAsPipeline().catch(() => undefined);
  enabled = false;
  loopDelay.disable();
}

/** Test hook: turn recording on without timers, Redis or instrumentation. */
export function enableRecordingForTests(on = true) { enabled = on; if (!on) { counters.clear(); maxima.clear(); metas.clear(); } }
export const pendingForTests = () => ({ counters: new Map(counters), maxima: new Map(maxima), metas: new Map(metas) });
