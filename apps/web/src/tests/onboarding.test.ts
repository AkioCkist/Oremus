import { describe, expect, it, vi } from 'vitest';
import { onboardingGate } from '../controllers/page.controller.js';
import { buildProfile, computeIdf, rankDocuments } from '../recommender/engine.js';
import { declaredSignals } from '../recommender/interests.js';
import { analyze, TOPICS } from '../recommender/text.js';
import { needsOnboarding, safeNext } from '../services/interest.service.js';
import { INTEREST_OPTIONS, MIN_INTERESTS } from '../shared/interests.js';
import { interestsSchema } from '../validators/index.js';
import { PEOPLE } from '../scripts/seed-data.js';
import { seedInterests } from '../scripts/seed-interests.js';

describe('who must take the interest survey', () => {
  it('requires it until the survey is completed or skipped, including accounts from before it existed', () => {
    expect(needsOnboarding({})).toBe(true);
    expect(needsOnboarding({ interests: { completedAt: null, skippedAt: null } })).toBe(true);
    expect(needsOnboarding({ interests: { completedAt: new Date() } })).toBe(false);
    expect(needsOnboarding({ interests: { skippedAt: new Date() } })).toBe(false);
    expect(needsOnboarding(null)).toBe(false);
  });

  it('only returns to local pages afterwards', () => {
    expect(safeNext('/groups/city-gardeners?tab=about')).toBe('/groups/city-gardeners?tab=about');
    for (const unsafe of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/onboarding', '/onboarding?next=/x', undefined, 42]) {
      expect(safeNext(unsafe)).toBe('/');
    }
  });

  const gate = (path: string, user: unknown, method = 'GET') => {
    const res = { redirect: vi.fn() };
    const next = vi.fn();
    onboardingGate({ path, originalUrl: path, method, user } as any, res as any, next);
    return { res, next };
  };

  it('redirects signed-in pages to the survey and keeps where the person was going', () => {
    const { res, next } = gate('/groups', { interests: {} });
    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, '/onboarding?next=%2Fgroups');
  });

  it('leaves the survey page, anonymous visitors, finished accounts and non-GET requests alone', () => {
    expect(gate('/onboarding', { interests: {} }).next).toHaveBeenCalled();
    expect(gate('/groups', undefined).next).toHaveBeenCalled();
    expect(gate('/', { interests: { skippedAt: new Date() } }).next).toHaveBeenCalled();
    expect(gate('/', { interests: {} }, 'POST').next).toHaveBeenCalled();
  });
});

describe('survey answers', () => {
  it(`needs at least ${MIN_INTERESTS} known topics and removes duplicates`, () => {
    expect(() => interestsSchema.parse({ topics: ['coffee', 'books'] })).toThrow(/at least/);
    expect(() => interestsSchema.parse({ topics: ['coffee', 'books', 'astrology'] })).toThrow();
    expect(interestsSchema.parse({ topics: ['coffee', 'books', 'coffee', 'music'] }).topics).toEqual(['coffee', 'books', 'music']);
  });

  it('cleans sub-interests: trimmed, case-insensitive duplicates removed, bounded', () => {
    const parsed = interestsSchema.parse({ topics: ['coffee', 'books', 'music'], keywords: ['  Latte art ', 'latte art', 'Jazz'] });
    expect(parsed.keywords).toEqual(['latte art', 'Jazz']);
    expect(() => interestsSchema.parse({ topics: ['coffee', 'books', 'music'], keywords: ['x'] })).toThrow();
    expect(() => interestsSchema.parse({ topics: ['coffee', 'books', 'music'], keywords: ['a'.repeat(41)] })).toThrow();
    expect(() => interestsSchema.parse({ topics: ['coffee', 'books', 'music'], keywords: Array.from({ length: 31 }, (_, i) => `topic ${i}`) })).toThrow();
  });

  it('offers only topics the recommender understands', () => {
    for (const option of INTEREST_OPTIONS) {
      expect(TOPICS[option.key], option.key).toBeDefined();
      expect(option.keywords.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('survey answers in recommendations', () => {
  const answeredAt = new Date(Date.UTC(2026, 9, 1));
  const now = Date.UTC(2026, 9, 17);

  it('turns completed answers into interest signals and ignores unfinished or skipped surveys', () => {
    expect(declaredSignals({ topics: ['coffee'], completedAt: null })).toEqual([]);
    const signals = declaredSignals({ topics: ['coffee', 'unknown'], keywords: ['Pour-over'], completedAt: answeredAt });
    expect(signals.map((signal) => signal.label)).toEqual(['Coffee', 'Pour-over']);
    expect(signals[0]!.features.some((feature) => feature.t === '#coffee')).toBe(true);
    expect(signals.every((signal) => signal.type === 'interest')).toBe(true);
  });

  it('ranks matching content first for a new account and explains it with the picked interest', () => {
    const docs = [
      { id: 'roaster', vector: analyze([['Specialty coffee roaster, pour-over and espresso every morning', 1]]).vector },
      { id: 'gamer', vector: analyze([['Valorant streamer and esports caster', 1]]).vector },
      { id: 'runner', vector: analyze([['Marathon runner and running coach', 1]]).vector }
    ];
    const profile = buildProfile(declaredSignals({ topics: ['coffee', 'books', 'music'], keywords: [], completedAt: answeredAt }), now);
    const ranked = rankDocuments(docs, profile, computeIdf(docs.map((doc) => doc.vector)), () => ({ code: 'popular', text: 'Popular on Oremus' }));
    expect(ranked[0]!.id).toBe('roaster');
    expect(ranked[0]!.reason.text).toBe('Matches your interest in Coffee');
    expect(profile.signalCount).toBe(0); // survey answers are not "activities"
  });

  it('lets recent behaviour outweigh old survey answers', () => {
    const docs = [
      { id: 'roaster', vector: analyze([['Specialty coffee roaster and barista', 1]]).vector },
      { id: 'diver', vector: analyze([['Scuba diving instructor, coral reefs', 1]]).vector }
    ];
    const old = { topics: ['coffee', 'books', 'music'], keywords: [], completedAt: new Date(now - 200 * 86_400_000) };
    const search = { type: 'search' as const, targetType: 'query' as const, label: 'scuba diving', features: [{ t: 'scuba', w: 0.5 }, { t: 'diving', w: 0.5 }, { t: 'scuba_diving', w: 0.5 }, { t: '#ocean', w: 0.5 }], createdAt: new Date(now - 3_600_000) };
    const profile = buildProfile([search, ...declaredSignals(old, now)], now);
    expect(rankDocuments(docs, profile, computeIdf(docs.map((doc) => doc.vector)), () => ({ code: 'popular', text: '' }))[0]!.id).toBe('diver');
  });
});

describe('sample interests', () => {
  const answeredAt = new Date();

  it('gives every sample account valid answers except the newcomer, who still has to take the survey', () => {
    for (const person of PEOPLE) {
      const interests = seedInterests(person, answeredAt);
      if (person.interests === 'pending') { expect(interests.completedAt).toBeNull(); continue; }
      expect(interests.completedAt, person.key).toEqual(answeredAt);
      expect(interests.topics.length, person.key).toBeGreaterThanOrEqual(MIN_INTERESTS);
      for (const topic of interests.topics) expect(INTEREST_OPTIONS.some((option) => option.key === topic), `${person.key}: ${topic}`).toBe(true);
    }
    expect(PEOPLE.filter((person) => person.interests === 'pending').map((person) => person.email)).toEqual(['new@example.com']);
  });
});
