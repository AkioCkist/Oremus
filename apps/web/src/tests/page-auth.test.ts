import request from 'supertest';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { errorHandler } from '../middleware/error.js';
import { registerSchema } from '../validators/index.js';

describe('authentication boundaries', () => {
  const app = createApp();

  it('redirects an anonymous page request to sign in', async () => {
    const response = await request(app).get('/').set('Accept', 'text/html');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/login');
  });

  it('keeps API authentication failures as JSON 401 responses', async () => {
    const response = await request(app).get('/api/dev/cache').set('Accept', 'application/json');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: { code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' },
    });
  });

  it('places the password field before the password reset link in keyboard order', async () => {
    const response = await request(app).get('/login').set('Accept', 'text/html');

    expect(response.status).toBe(200);
    expect(response.text.indexOf('id="email"')).toBeLessThan(response.text.indexOf('id="password"'));
    expect(response.text.indexOf('id="password"')).toBeLessThan(response.text.indexOf('href="/reset-password"'));
  });

  it('does not upgrade local HTTP assets to unavailable HTTPS URLs', async () => {
    const response = await request(app).get('/login').set('Accept', 'text/html');

    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });

  it('loads the realtime client from the local Socket.IO server', async () => {
    const response = await request(app).get('/login').set('Accept', 'text/html');

    expect(response.text).toContain('src="/socket.io/socket.io.js"');
    expect(response.text).not.toContain('cdn.socket.io/4.8.1/socket.io.min.js');
  });
});

describe('validation responses', () => {
  const app = express();
  app.get('/auth/validation-test', () => {
    registerSchema.parse({ email: 'a@example.com', username: 'person', displayName: 'Person', password: 'alllowercase' });
  });
  app.use(errorHandler);

  it('returns a friendly message instead of the serialized Zod error', async () => {
    const response = await request(app).get('/auth/validation-test');

    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Password must include an uppercase letter.'
    });
    expect(response.body.error.message).not.toContain('"validation"');
  });
});
