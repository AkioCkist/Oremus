import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { assetCacheControl, createApp } from '../app.js';

const redis = vi.hoisted(() => ({
  get: vi.fn(),
  hIncrBy: vi.fn().mockResolvedValue(1),
  set: vi.fn(),
  del: vi.fn(),
  scan: vi.fn(),
  incr: vi.fn(),
  hGetAll: vi.fn()
}));

vi.mock('../config/database.js', () => ({
  redis,
  checkInfrastructure: vi.fn().mockResolvedValue({ mongodb: 'ok', redis: 'ok' })
}));

describe('HTTP cache policy', () => {
  it('caches versioned bundles immutably in production', () => {
    expect(assetCacheControl('/app/public/assets/app.js', true)).toBe('public, max-age=31536000, immutable');
    expect(assetCacheControl('/app/public/assets/styles.css', true)).toBe('public, max-age=31536000, immutable');
  });

  it('uses a bounded cache for unversioned assets and disables caching in development', () => {
    expect(assetCacheControl('/app/public/assets/brand/logo.svg', true)).toBe('public, max-age=604800');
    expect(assetCacheControl('/app/public/assets/app.js', false)).toBe('no-store');
  });

  it('treats the image worker bundle as a versioned, immutable asset', () => {
    expect(assetCacheControl('/app/public/assets/image-worker.js', true)).toBe('public, max-age=31536000, immutable');
  });

  it('serves the service worker for the whole site and always revalidates it', async () => {
    const response = await request(createApp()).get('/sw.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['service-worker-allowed']).toBe('/');
  });

  it('renders the offline fallback page without session data', async () => {
    const response = await request(createApp()).get('/offline');

    expect(response.status).toBe(200);
    expect(response.text).toContain("You're offline");
    expect(response.text).toContain('<meta name="csrf-token" content="">');
    expect(response.text).not.toContain('data-user-id');
  });

  it('prevents storage of dynamic pages containing personalized or CSRF data', async () => {
    const response = await request(createApp()).get('/login');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('Redis invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.incr.mockResolvedValue(1);
    redis.del.mockResolvedValue(1);
    redis.scan.mockResolvedValue({ cursor: '0', keys: [] });
  });

  it('invalidates every feed in O(1) and deletes exact profile keys', async () => {
    const { invalidateSocialCaches } = await import('../services/cache.service.js');

    await invalidateSocialCaches(['user-a', 'user-a', 'user-b']);

    expect(redis.incr).toHaveBeenCalledWith('cache:version:feed');
    expect(redis.del).toHaveBeenCalledWith(['profile:user-a', 'profile:user-b']);
    expect(redis.scan).not.toHaveBeenCalled();
  });

  it('scans short-lived search keys only when indexed content changes', async () => {
    const { invalidateSocialCaches } = await import('../services/cache.service.js');

    await invalidateSocialCaches([], { search: true });

    expect(redis.scan).toHaveBeenCalledWith('0', { MATCH: 'search:*', COUNT: 100 });
  });
});
