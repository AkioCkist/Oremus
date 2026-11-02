import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/database.js', () => ({
  checkInfrastructure: vi.fn(),
  redis: { exists: vi.fn(async () => 0), get: vi.fn(async () => null), set: vi.fn(), incr: vi.fn(async () => 1), expire: vi.fn() }
}));

import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { sameOriginWrites } from '../admin/mount.js';

const cookie = () => `access_token=${jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, { subject: '507f1f77bcf86cd799439011', jwtid: 'test' })}`;
const asUser = (fields: Record<string, unknown>) => vi.spyOn(User, 'findOne').mockResolvedValue({ id: '507f1f77bcf86cd799439011', toObject: () => ({}), ...fields } as any);

describe('/admin access', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('is indistinguishable from a missing page when signed out', async () => {
    expect((await request(createApp()).get('/admin').set('accept', 'application/json')).status).toBe(404);
    expect((await request(createApp()).post('/admin/api/resources/User/records/x/ban').set('accept', 'application/json')).status).toBe(404);
  });

  it('turns away regular members', async () => {
    asUser({ role: 'user', status: 'active' });
    const response = await request(createApp()).get('/admin').set('cookie', cookie()).set('accept', 'application/json');
    expect(response.status).toBe(404);
  });

  it('treats banned staff as signed out', async () => {
    asUser({ role: 'admin', status: 'banned' });
    const response = await request(createApp()).get('/admin').set('cookie', cookie()).set('accept', 'application/json');
    expect(response.status).toBe(404);
  });

  it('keeps the strict policy on the public site', async () => {
    const response = await request(createApp()).get('/offline');
    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
  });
});

describe('sameOriginWrites', () => {
  const check = (method: string, headers: Record<string, string>, path = '/resources/User') => {
    const next = vi.fn();
    sameOriginWrites({ method, path, get: (name: string) => headers[name] } as any, {} as any, next);
    return next.mock.calls[0]?.[0];
  };

  it('lets page reads through', () => {
    expect(check('GET', {})).toBeUndefined();
  });

  it('only runs API reads (and one-click actions) for the panel itself', () => {
    const api = '/api/resources/AdCampaign/records/1/approve';
    expect(check('GET', { 'sec-fetch-site': 'same-origin' }, api)).toBeUndefined();
    expect(check('GET', { 'sec-fetch-site': 'cross-site' }, api)?.status).toBe(403);
    expect(check('GET', { 'sec-fetch-site': 'same-site' }, api)?.status).toBe(403);
    expect(check('GET', { referer: 'https://oremus.test/admin', host: 'oremus.test' }, api)).toBeUndefined();
    expect(check('GET', { host: 'oremus.test' }, api)?.status).toBe(403);
  });

  it('refuses writes from another site or with no origin', () => {
    expect(check('POST', { origin: 'https://evil.example', host: 'oremus.test' })?.statusCode ?? check('POST', { origin: 'https://evil.example', host: 'oremus.test' })?.status).toBe(403);
    expect(check('POST', { host: 'oremus.test' })).toBeDefined();
  });

  it('accepts writes from the same host', () => {
    expect(check('POST', { origin: 'https://oremus.test', host: 'oremus.test' })).toBeUndefined();
  });
});
