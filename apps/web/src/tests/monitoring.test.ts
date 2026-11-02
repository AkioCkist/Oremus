import { afterEach, describe, expect, it } from 'vitest';
import { cacheFamily, errorLocation, filterShape, queryKey, recordCache, recordException, routeKey } from '../monitoring/instrument.js';
import { enableRecordingForTests, field, pendingForTests, record, splitField } from '../monitoring/recorder.js';
import { addBucket, parseRedisInfo, type Totals } from '../monitoring/read.js';

afterEach(() => enableRecordingForTests(false));

describe('monitoring names', () => {
  it('names requests by route pattern, never by the real path', () => {
    expect(routeKey('GET', '', '/posts/:postId', '/posts/6ae5', 200)).toBe('GET /posts/:postId');
    expect(routeKey('POST', '/api', '/posts/:postId/reactions', '/api/posts/1/reactions', 200)).toBe('POST /api/posts/:postId/reactions');
    expect(routeKey('GET', '/groups', '/', '/groups', 200)).toBe('GET /groups');
    expect(routeKey('GET', '', undefined, '/admin/resources/User', 200)).toBe('GET /admin/*');
    expect(routeKey('GET', '', undefined, '/nope/123', 404)).toBe('GET (not found)');
  });

  it('describes a query by its fields and operators, without values', () => {
    expect(filterShape({ authorId: 'x', deletedAt: null, createdAt: { $lt: new Date() } })).toBe('{authorId, createdAt:$lt, deletedAt}');
    expect(filterShape({ $or: [{ a: 1 }, { b: 2 }] })).toBe('{$or[{a}, {b}]}');
    expect(queryKey('find', { find: 'posts', filter: { email: 'secret@example.com' }, sort: { createdAt: -1 } })).toBe('posts.find {email} sort {createdAt}');
    expect(queryKey('aggregate', { aggregate: 'posts', pipeline: [{ $match: { status: 'open' } }, { $group: {} }] })).toBe('posts.aggregate [$match {status}, $group]');
    expect(queryKey('update', { update: 'users', updates: [{ q: { _id: 1 }, u: {} }] })).toBe('users.update {_id}');
    expect(queryKey('hello', { hello: 1 })).toBeNull();
    expect(queryKey('aggregate', { aggregate: 'posts', pipeline: [{ $collStats: {} }] })).toBeNull();
  });

  it('groups cache keys by family', () => {
    expect(cacheFamily('profile:123')).toBe('profile');
    expect(cacheFamily('cache:ads:eligible')).toBe('ads');
  });

  it('points an exception at our own code', () => {
    const stack = 'Error: boom\n    at x (C:/app/node_modules/express/lib/router.js:1:1)\n    at handler (C:/app/src/controllers/post.controller.ts:42:7)';
    expect(errorLocation(stack)).toMatch(/post\.controller\.ts:42$/);
  });
});

describe('monitoring recorder', () => {
  it('records nothing until monitoring is started', () => {
    record('requests', 'GET /', { count: 1 }, 5);
    recordCache('profile:1', true);
    expect(pendingForTests().counters.size).toBe(0);
  });

  it('adds counts and keeps the worst duration', () => {
    enableRecordingForTests();
    record('requests', 'GET /', { count: 1, sum: 10 }, 10);
    record('requests', 'GET /', { count: 1, sum: 30 }, 30);
    recordCache('profile:1', false);
    const { counters, maxima } = pendingForTests();
    expect([...counters.values()]).toEqual(expect.arrayContaining([2, 40, 1]));
    expect([...maxima.values()]).toContain(30);
  });

  it('groups repeated exceptions into one entry', () => {
    enableRecordingForTests();
    // Same throw site, different ids in the message.
    const fail = (id: string) => new Error(`Post ${id} not found`);
    recordException(fail('6ae578b9235503f71cd6258e'));
    recordException(fail('6ae578b9235503f71cd6258f'));
    const counts = [...pendingForTests().counters.entries()].filter(([id]) => id.startsWith('exceptions'));
    expect(counts).toHaveLength(1);
    expect(counts[0]![1]).toBe(2);
  });
});

describe('monitoring reader', () => {
  it('sums bucket hashes per key', () => {
    const totals = new Map<string, Totals>();
    addBucket(totals, { [field('GET /', 'count')]: '3', [field('GET /', 'slow')]: '1' });
    addBucket(totals, { [field('GET /', 'count')]: '2' });
    expect(totals.get('GET /')).toMatchObject({ count: 5, slow: 1 });
    expect(splitField(field('a:b', 'hit'))).toEqual(['a:b', 'hit']);
  });

  it('parses Redis INFO', () => {
    const info = parseRedisInfo('# Server\r\nredis_version:7.4.0\r\n# Stats\r\nkeyspace_hits:9\r\ndb0:keys=12,expires=3\r\n');
    expect(info).toMatchObject({ redis_version: '7.4.0', keyspace_hits: '9', db0: 'keys=12,expires=3' });
  });
});
