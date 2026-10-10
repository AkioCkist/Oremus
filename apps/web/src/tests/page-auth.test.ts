import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

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
});
