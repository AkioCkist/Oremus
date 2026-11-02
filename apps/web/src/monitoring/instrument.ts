import { createHash } from 'node:crypto';
import path from 'node:path';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { MongoClient } from 'mongodb';
import { onMonitoringStart, record, recordMeta, thresholds } from './recorder.js';

/*
 * What gets measured, and how each thing is named so similar events add up: requests by route pattern
 * ("GET /posts/:postId", never the real id), queries by collection, operation and the *shape* of the filter
 * (field names, never values), outgoing calls by host, cache reads by key family.
 */

/* ---------- Requests ---------- */

// Static files (ours and the admin panel's bundles) are not application work.
const SKIP = ['/assets/', '/uploads/', '/sw.js', '/favicon', '/health', '/admin/frontend/'];

export function routeKey(method: string, baseUrl: string, routePath: unknown, originalPath: string, status: number): string {
  if (routePath !== undefined && routePath !== null) {
    const route = String(routePath);
    return `${method} ${baseUrl && route === '/' ? baseUrl : `${baseUrl}${route}`}`;
  }
  if (originalPath === '/admin' || originalPath.startsWith('/admin/')) return `${method} /admin/*`;
  if (status === 404) return `${method} (not found)`;
  const first = originalPath.split('/').filter(Boolean)[0];
  return `${method} ${first ? `/${first}/*` : '/'}`;
}

export const requestMonitor: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (SKIP.some((prefix) => req.path.startsWith(prefix))) return next();
  const started = process.hrtime.bigint();
  res.once('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const status = res.statusCode;
    const key = routeKey(req.method, req.baseUrl || '', req.route?.path, req.originalUrl.split('?')[0] || '/', status);
    const slow = ms >= thresholds.request ? 1 : 0;
    const stats = { count: 1, sum: ms, slow, error: status >= 500 ? 1 : 0 };
    record('requests', key, stats, ms);
    record('requests', '_all', stats, ms);
    record('requests', `_status:${Math.floor(status / 100)}xx`, { count: 1 });
    if (slow) recordMeta('requests', key, { lastSlowAt: Date.now(), lastSlowMs: Math.round(ms), status });
    const userId = (req as any).user?.id;
    if (userId) record('users', String(userId), { count: 1, slow, sum: ms });
  });
  next();
};

/* ---------- Exceptions ---------- */

const normalizeMessage = (message: string) => message
  .replace(/[a-f0-9]{24}/gi, ':id')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
  .replace(/\b\d{2,}\b/g, 'N')
  .slice(0, 300);

/** First stack frame in our own code, relative to the app root. */
export function errorLocation(stack = ''): string {
  const frames = stack.split('\n').slice(1).map((line) => line.trim());
  const ours = frames.find((line) => !line.includes('node_modules') && !line.includes('node:') && /[\\/](src|dist)[\\/]/.test(line)) || frames[0] || '';
  const match = /\(?((?:file:\/\/)?[^()\s]+):(\d+):\d+\)?$/.exec(ours);
  if (!match) return ours.replace(/^at\s+/, '').slice(0, 160);
  const file = match[1]!.replace(/^file:\/\//, '');
  const relative = path.relative(process.cwd(), file).replace(/\\/g, '/');
  return `${relative.startsWith('..') ? path.basename(file) : relative}:${match[2]}`;
}

export function recordException(error: unknown, context: { source: string; route?: string } = { source: 'request' }): void {
  const failure = error instanceof Error ? error : new Error(String(error));
  const name = failure.name || 'Error';
  const message = normalizeMessage(failure.message || '');
  const location = errorLocation(failure.stack);
  const key = createHash('sha1').update(`${name}|${message}|${location}`).digest('hex').slice(0, 16);
  record('exceptions', key, { count: 1 });
  recordMeta('exceptions', key, { name, message, location, source: context.source, route: context.route, lastAt: Date.now(), stack: (failure.stack || '').split('\n').slice(0, 10).join('\n') });
}

/* ---------- MongoDB ---------- */

const IGNORED = new Set(['hello', 'ismaster', 'isMaster', 'ping', 'buildInfo', 'saslStart', 'saslContinue', 'endSessions', 'killCursors', 'serverStatus', 'dbStats', 'collStats', 'listCollections', 'listIndexes', 'createIndexes', 'getParameter', 'abortTransaction', 'commitTransaction', 'connectionStatus', 'getLastError']);

const isPlain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/** Field names and operators of a filter, without any values: { a: 1, b: { $in: [...] } } → "{a, b:$in}". */
export function filterShape(filter: unknown, depth = 0): string {
  if (!isPlain(filter)) return '';
  const parts = Object.keys(filter).sort().map((key) => {
    const value = filter[key];
    if (key.startsWith('$') && Array.isArray(value)) return `${key}[${value.slice(0, 2).map((item) => filterShape(item, depth + 1)).join(', ')}]`;
    if (isPlain(value)) {
      const operators = Object.keys(value).filter((inner) => inner.startsWith('$'));
      if (operators.length) return `${key}:${operators.sort().join('/')}`;
      if (depth < 1) return `${key}${filterShape(value, depth + 1)}`;
    }
    return key;
  });
  return `{${parts.join(', ')}}`.slice(0, 160);
}

export function queryKey(commandName: string, command: Record<string, any>): string | null {
  if (IGNORED.has(commandName)) return null;
  // The monitoring page's own storage statistics.
  if (commandName === 'aggregate' && command.pipeline?.[0]?.$collStats) return null;
  const collection = typeof command[commandName] === 'string' ? command[commandName] : typeof command.collection === 'string' ? command.collection : null;
  if (!collection) return null;
  let shape = '';
  switch (commandName) {
    case 'find': shape = `${filterShape(command.filter)}${isPlain(command.sort) ? ` sort ${filterShape(command.sort)}` : ''}`; break;
    case 'aggregate': shape = `[${(command.pipeline || []).slice(0, 6).map((stage: Record<string, unknown>) => {
      const op = Object.keys(stage || {})[0] || '?';
      return op === '$match' ? `$match ${filterShape(stage.$match)}` : op;
    }).join(', ')}]`; break;
    case 'update': shape = filterShape(command.updates?.[0]?.q); break;
    case 'delete': shape = filterShape(command.deletes?.[0]?.q); break;
    case 'findAndModify': shape = filterShape(command.query); break;
    case 'count': shape = filterShape(command.query); break;
    case 'distinct': shape = `${command.key} ${filterShape(command.query)}`; break;
    default: shape = '';
  }
  return `${collection}.${commandName}${shape ? ` ${shape}` : ''}`;
}

/** Times every MongoDB command. Needs `monitorCommands: true` on the connection (config/database.ts). */
export function instrumentMongo(client: MongoClient): void {
  const pending = new Map<number, string>();
  client.on('commandStarted', (event) => {
    const key = queryKey(event.commandName, event.command as Record<string, any>);
    if (key && pending.size < 5_000) pending.set(event.requestId, key);
  });
  const done = (event: { requestId: number; duration: number }, failed: boolean) => {
    const key = pending.get(event.requestId);
    if (!key) return;
    pending.delete(event.requestId);
    const slow = event.duration >= thresholds.query ? 1 : 0;
    record('queries', key, { count: 1, sum: event.duration, slow, error: failed ? 1 : 0 }, event.duration);
    if (slow) recordMeta('queries', key, { lastSlowAt: Date.now(), lastSlowMs: Math.round(event.duration) });
  };
  client.on('commandSucceeded', (event) => done(event, false));
  client.on('commandFailed', (event) => done(event, true));
}

/* ---------- Cache ---------- */

/** "profile:123" → "profile", "cache:admin:metrics" → "admin". */
export const cacheFamily = (key: string) => { const parts = key.split(':'); return (parts[0] === 'cache' ? parts[1] : parts[0]) || key; };

export function recordCache(key: string, hit: boolean): void {
  record('cache', cacheFamily(key), hit ? { hit: 1 } : { miss: 1 });
}

/* ---------- Jobs ---------- */

export function recordJob(queue: string, name: string, ms: number, failed: boolean): void {
  record('jobs', `${queue}:${name}`, { count: 1, sum: ms, slow: ms >= thresholds.job ? 1 : 0, error: failed ? 1 : 0 }, ms);
}

/* ---------- Outgoing HTTP ---------- */

function instrumentFetch(): void {
  const current = globalThis.fetch as typeof fetch & { __monitored?: boolean };
  if (typeof current !== 'function' || current.__monitored) return;
  const wrapped = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const started = performance.now();
    let origin = 'unknown';
    try { origin = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).origin; } catch { /* relative or invalid */ }
    const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET').toUpperCase();
    const key = `${method} ${origin}`;
    const finish = (failed: boolean) => {
      const ms = performance.now() - started;
      record('outgoing', key, { count: 1, sum: ms, slow: ms >= thresholds.outgoing ? 1 : 0, error: failed ? 1 : 0 }, ms);
    };
    try {
      const response = await current(input, init);
      finish(response.status >= 500);
      return response;
    } catch (error) {
      finish(true);
      throw error;
    }
  }) as typeof fetch & { __monitored?: boolean };
  wrapped.__monitored = true;
  globalThis.fetch = wrapped;
}

onMonitoringStart(() => {
  instrumentFetch();
  // Observes crashes without changing what Node does about them.
  process.on('uncaughtExceptionMonitor', (error) => recordException(error, { source: 'process' }));
});
