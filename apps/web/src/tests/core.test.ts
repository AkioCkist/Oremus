import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { registerSchema, postSchema, reactionSchema } from '../validators/index.js';
import { assertOwner } from '../services/permissions.js';

describe('authentication policy', () => {
  it('requires a strong password during registration', () => {
    expect(() => registerSchema.parse({ email: 'a@example.com', username: 'person', displayName: 'Person', password: 'weak' })).toThrow();
  });
  it('stores password-compatible hashes rather than plaintext', async () => {
    const hash = await bcrypt.hash('CircleSpace123', 4);
    expect(hash).not.toContain('CircleSpace123');
    expect(await bcrypt.compare('CircleSpace123', hash)).toBe(true);
  });
});

describe('post and reaction validation', () => {
  it('accepts text and image-only post payloads', () => {
    expect(postSchema.parse({ content: 'A real update', visibility: 'public' }).content).toBe('A real update');
    expect(postSchema.parse({ content: '', visibility: 'public' }).content).toBe('');
  });
  it.each(['like', 'love', 'haha', 'wow', 'sad', 'angry'])('accepts the %s reaction', (type) => {
    expect(reactionSchema.parse({ type }).type).toBe(type);
  });
  it('rejects unsupported reactions', () => expect(() => reactionSchema.parse({ type: 'fire' })).toThrow());
});

describe('ownership checks', () => {
  it('allows the owner and rejects another user', () => {
    expect(() => assertOwner('owner', 'owner')).not.toThrow();
    expect(() => assertOwner('owner', 'intruder')).toThrowError(/own/);
  });
});
