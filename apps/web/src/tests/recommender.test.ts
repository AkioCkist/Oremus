import { describe, expect, it } from 'vitest';
import { buildProfile, computeIdf, diversify, rankDocuments, signalStrength, topInterests, type Candidate, type Signal } from '../recommender/engine.js';
import { groupText, postText, queryText, storyText, userText } from '../recommender/documents.js';
import { analyze, fold, tokenize, topFeatures } from '../recommender/text.js';
import { activitySchema } from '../validators/index.js';
import { COMMENTS, EXTRA_FOLLOWS, FRIENDS, GROUPS, PEOPLE, POSTS, SIGNALS, STORIES } from '../scripts/seed-data.js';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 17, 12);
const tokens = (text: string) => tokenize(text).map((token) => token.t);
const features = (text: string) => topFeatures(analyze([[text, 1]]));
const signal = (partial: Partial<Signal> & Pick<Signal, 'type' | 'targetType' | 'features'>, hoursAgo = 1): Signal =>
  ({ targetId: null, label: '', durationMs: 0, createdAt: new Date(NOW - hoursAgo * HOUR), ...partial });
const doc = (id: string, text: string, extra: Partial<Candidate> = {}): Candidate => ({ id, vector: analyze([[text, 1]]).vector, ...extra });
const fallback = () => ({ code: 'popular' as const, text: 'Popular on Oremus' });

const corpus = [
  doc('coffee-group', 'Specialty coffee roasters: pour over recipes, cupping notes, espresso and Vietnamese Arabica beans'),
  doc('egg-coffee', 'Cà phê trứng ở Hà Nội ngon nhất phố cổ, quán cà phê nhỏ xinh'),
  doc('hiking', 'Weekend trek to the mountain summit, camping by the waterfall'),
  doc('running', 'Marathon training plan: intervals, long runs and race pace for your first half marathon'),
  doc('gaming', 'Valorant scrim tonight, esports co-op stream on Twitch'),
  doc('ai', 'Fine-tuning an LLM with machine learning on a Vietnamese dataset')
];
const idf = computeIdf(corpus.map((item) => item.vector));

describe('text analysis', () => {
  it('folds Vietnamese diacritics so searches without accents still match', () => {
    expect(fold('Cà phê sữa đá Đà Lạt')).toBe('ca phe sua da da lat');
    expect(tokens('Cà phê trứng')).toEqual(expect.arrayContaining(['ca', 'phe', 'ca_phe', 'trung']));
    expect(tokens('ca phe')).toContain('ca_phe');
  });

  it('drops stopwords, numbers and URLs, and never joins words across punctuation', () => {
    const result = tokens('I love the coffee in 2026. Running is fun https://example.com/x');
    expect(result).not.toContain('the');
    expect(result).not.toContain('2026');
    expect(result.some((token) => token.includes('example'))).toBe(false);
    expect(result).not.toContain('coffee_running');
  });

  it('treats upper-case AI as the technology and lower-case "ai" as the Vietnamese "who"', () => {
    expect(tokens('AI models')).toContain('ai');
    expect(tokens('ai có tài liệu')).not.toContain('ai');
    expect(analyze(queryText('ai')).vector.has('ai')).toBe(true);
  });

  it('maps different wordings and languages onto the same topic', () => {
    for (const text of ['egg coffee in Hanoi', 'Cà phê muối Huế', 'our barista pulls a great espresso']) {
      expect(analyze([[text, 1]]).vector.has('#coffee')).toBe(true);
    }
    expect(analyze([['Chạy bộ buổi sáng, half marathon next month', 1]]).vector.has('#running')).toBe(true);
  });

  it('matches Vietnamese topic phrases made of stopwords, without matching names that share a word', () => {
    const topics = (text: string) => [...analyze([[text, 1]]).vector.keys()].filter((key) => key.startsWith('#'));
    expect(topics('Âm nhạc và nhiếp ảnh')).toEqual(expect.arrayContaining(['#music', '#photography']));
    expect(topics('Thời trang bền vững')).toContain('#fashion');
    expect(topics('Nhận nuôi thú cưng')).toContain('#pets');
    expect(topics('Trang Do is a vet')).not.toContain('#fashion');
    expect(topics('My neighbour\'s pug Bánh Bao')).not.toContain('#baking');
    expect(topics('Làm bánh sourdough cuối tuần')).toContain('#baking');
    expect(topics('Ai có tài liệu cho mình xin')).toEqual([]);
  });

  it('produces unit-length vectors and compact stored features with readable spellings', () => {
    const { vector } = analyze([['Bánh mì chảo Sài Gòn', 1]]);
    const length = Math.sqrt([...vector.values()].reduce((sum, value) => sum + value * value, 0));
    expect(length).toBeCloseTo(1, 6);
    const stored = features('Bánh mì chảo Sài Gòn');
    expect(stored.length).toBeLessThanOrEqual(24);
    expect(stored.find((feature) => feature.t === 'banh_mi')?.s).toBe('bánh mì');
  });

  it('describes followers-only profiles by their public posts alone', () => {
    const parts = userText({ profile: { privacy: 'followers', bio: 'secret bio about chess' } }, ['Public post about sourdough']);
    const vector = analyze(parts).vector;
    expect(vector.has('chess')).toBe(false);
    expect(vector.has('sourdough')).toBe(true);
  });
});

describe('interest profile', () => {
  it('ignores glances and saturates long reads', () => {
    const glance = signalStrength([signal({ type: 'dwell', targetType: 'post', targetId: 'p', durationMs: 800, features: [] })], NOW);
    const short = signalStrength([signal({ type: 'dwell', targetType: 'post', targetId: 'p', durationMs: 5000, features: [] })], NOW);
    const long = signalStrength([signal({ type: 'dwell', targetType: 'post', targetId: 'p', durationMs: 60_000, features: [] })], NOW);
    const endless = signalStrength([signal({ type: 'dwell', targetType: 'post', targetId: 'p', durationMs: 3_600_000, features: [] })], NOW);
    expect(glance).toBe(0);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(endless).toBeLessThanOrEqual(3);
  });

  it('weighs recent signals more and repeats with diminishing returns', () => {
    const fresh = signalStrength([signal({ type: 'search', targetType: 'query', label: 'coffee', features: [] }, 1)], NOW);
    const old = signalStrength([signal({ type: 'search', targetType: 'query', label: 'coffee', features: [] }, 24 * 20)], NOW);
    expect(old).toBeLessThan(fresh / 3);
    const once = signalStrength([signal({ type: 'open', targetType: 'post', targetId: 'p', features: [] })], NOW);
    const thrice = signalStrength([1, 2, 3].map(() => signal({ type: 'open', targetType: 'post', targetId: 'p', features: [] })), NOW);
    expect(thrice).toBeGreaterThan(once);
    expect(thrice).toBeLessThan(once * 3);
  });

  it('remembers which signal explains each interest and what was already seen', () => {
    const profile = buildProfile([
      signal({ type: 'search', targetType: 'query', label: 'cà phê', features: features('cà phê') }),
      signal({ type: 'open', targetType: 'post', targetId: 'post-1', authorId: 'author-1', features: features('Trail running in the hills') }),
      signal({ type: 'dwell', targetType: 'post', targetId: 'post-2', durationMs: 3000, features: features('Valorant esports') })
    ], NOW);
    expect(profile.sources.get('ca_phe')).toMatchObject({ type: 'search', label: 'cà phê' });
    expect(profile.authors.get('author-1')).toBe(1);
    expect(profile.seen.post.has('post-1')).toBe(true);
    expect(profile.seen.post.has('post-2')).toBe(false); // a 3-second read is not "seen"
  });
});

describe('ranking', () => {
  it('puts what you searched first and says why', () => {
    const profile = buildProfile([signal({ type: 'search', targetType: 'query', label: 'coffee', features: topFeatures(analyze(queryText('coffee'))) })], NOW);
    const ranked = rankDocuments(corpus, profile, idf, fallback);
    expect(ranked[0]!.id).toBe('coffee-group');
    expect(ranked[0]!.reason.text).toBe('Because you searched “coffee”');
    // The Vietnamese egg-coffee post shares no word with "coffee" but still beats unrelated topics through #coffee.
    expect(ranked.findIndex((item) => item.id === 'egg-coffee')).toBeLessThan(ranked.findIndex((item) => item.id === 'hiking'));
  });

  it('matches a search typed without accents against accented content', () => {
    const profile = buildProfile([signal({ type: 'search', targetType: 'query', label: 'ca phe trung', features: topFeatures(analyze(queryText('ca phe trung'))) })], NOW);
    expect(rankDocuments(corpus, profile, idf, fallback)[0]!.id).toBe('egg-coffee');
  });

  it('learns from reading time: long reads about running surface running content', () => {
    const profile = buildProfile([
      signal({ type: 'dwell', targetType: 'post', targetId: 'r1', durationMs: 45_000, features: features('Sub-3 marathon finished, negative split and race pace') }),
      signal({ type: 'dwell', targetType: 'post', targetId: 'g1', durationMs: 2000, features: features('Valorant ranked game') })
    ], NOW);
    const ranked = rankDocuments(corpus, profile, idf, fallback);
    expect(ranked[0]!.id).toBe('running');
    expect(ranked[0]!.reason.code).toBe('read');
  });

  it('explains a second interest, but not a match that is only noise', () => {
    const profile = buildProfile([
      signal({ type: 'dwell', targetType: 'post', targetId: 'r1', durationMs: 60_000, features: features('Marathon race pace, marathon training, running club, half marathon') }),
      signal({ type: 'search', targetType: 'query', label: 'scuba diving', features: topFeatures(analyze(queryText('scuba diving'))) }, 2)
    ], NOW);
    const pool = [
      doc('runner', 'Marathon runner and running coach, marathon training plans'),
      doc('diver', 'Scuba diving instructor, reef dives and freediving'),
      doc('student', 'IT student, coding, k-pop, beach volleyball. Study break by the sea, then back to the books, exams and homework')
    ];
    const ranked = rankDocuments(pool, profile, computeIdf([...corpus, ...pool].map((item) => item.vector)), fallback);
    expect(ranked.find((item) => item.id === 'diver')!.reason.text).toBe('Because you searched “scuba diving”');
    expect(ranked.find((item) => item.id === 'student')!.reason.code).toBe('popular');
  });

  it('follows the latest interest when tastes change', () => {
    const profile = buildProfile([
      signal({ type: 'search', targetType: 'query', label: 'hiking', features: topFeatures(analyze(queryText('hiking'))) }, 24 * 40),
      signal({ type: 'search', targetType: 'query', label: 'machine learning', features: topFeatures(analyze(queryText('machine learning'))) }, 1)
    ], NOW);
    expect(rankDocuments(corpus, profile, idf, fallback)[0]!.id).toBe('ai');
  });

  it('falls back to social proof and popularity without any behaviour', () => {
    const profile = buildProfile([], NOW);
    const ranked = rankDocuments([
      doc('a', 'coffee', { social: 0 }), doc('b', 'hiking', { social: 1, socialReason: '5 mutual friends' })
    ], profile, idf, (item) => ({ code: 'social', text: (item as Candidate & { socialReason?: string }).socialReason || 'Suggested for you' }));
    expect(ranked[0]!.id).toBe('b');
    expect(ranked[0]!.reason.text).toBe('5 mutual friends');
  });

  it('limits results per author while keeping order', () => {
    const items = [{ id: 1, a: 'x' }, { id: 2, a: 'x' }, { id: 3, a: 'x' }, { id: 4, a: 'y' }];
    expect(diversify(items, (item) => item.a, 2, 10).map((item) => item.id)).toEqual([1, 2, 4]);
    expect(diversify(items, (item) => item.a, 1, 1).map((item) => item.id)).toEqual([1]);
  });

  it('lists interests with topics first and without repeating a bigram\'s parts', () => {
    const profile = buildProfile([signal({ type: 'search', targetType: 'query', label: 'egg coffee', features: topFeatures(analyze(queryText('egg coffee'))) })], NOW);
    const interests = topInterests(profile, 5);
    expect(interests[0]).toMatchObject({ label: 'Coffee', topic: true });
    const labels = interests.map((interest) => interest.label);
    expect(labels).toContain('egg coffee');
    expect(labels).not.toContain('egg');
  });
});

describe('documents', () => {
  it('describes every kind of content in the same feature space', () => {
    const coffee = (parts: Parameters<typeof analyze>[0]) => analyze(parts).vector.has('#coffee');
    expect(coffee(postText({ content: 'New beans: washed Arabica' }))).toBe(true);
    expect(coffee(userText({ profile: { bio: 'Barista and roaster', hobbies: ['Latte art'] } }))).toBe(true);
    expect(coffee(groupText({ name: 'Coffee Lovers', tags: ['cafes'], description: 'Brewing gear' }))).toBe(true);
    expect(coffee(storyText({ text: 'Fresh espresso ☕' }))).toBe(true);
  });
});

describe('activity payload', () => {
  const id = 'a'.repeat(24);
  it('accepts reading time and clicks', () => {
    expect(activitySchema.parse({ events: [{ type: 'dwell', postId: id, ms: 4200 }, { type: 'click', target: 'group', id }] }).events).toHaveLength(2);
  });
  it('rejects bad ids, unknown targets, huge durations and empty batches', () => {
    expect(() => activitySchema.parse({ events: [{ type: 'dwell', postId: 'nope', ms: 10 }] })).toThrow();
    expect(() => activitySchema.parse({ events: [{ type: 'click', target: 'comment', id }] })).toThrow();
    expect(() => activitySchema.parse({ events: [{ type: 'dwell', postId: id, ms: 3_600_000 }] })).toThrow();
    expect(() => activitySchema.parse({ events: [] })).toThrow();
  });
});

describe('sample data for recommendations', () => {
  const people = new Set(PEOPLE.map((person) => person.key));
  const groups = new Map(GROUPS.map((group) => [group.slug, group]));

  it('references only people, groups and posts that exist', () => {
    for (const post of POSTS) {
      expect(people.has(post.author), post.key).toBe(true);
      if (post.group) expect(groups.get(post.group)?.members.some(([key]) => key === post.author), post.key).toBe(true);
      expect(COMMENTS[post.topic], post.topic).toBeDefined();
    }
    for (const story of STORIES) { expect(people.has(story.author)).toBe(true); expect(story.minutesAgo).toBeLessThan(24 * 60); }
    for (const [a, b] of [...FRIENDS, ...EXTRA_FOLLOWS]) { expect(people.has(a) && people.has(b) && a !== b, `${a}-${b}`).toBe(true); }
    for (const item of SIGNALS) {
      expect(people.has(item.user)).toBe(true);
      if (item.post) expect(POSTS.some((post) => post.key === item.post), item.post).toBe(true);
      if (item.profile) expect(people.has(item.profile)).toBe(true);
      if (item.group) expect(groups.has(item.group)).toBe(true);
    }
  });

  it('keeps keys, e-mails and avatars unique', () => {
    for (const values of [PEOPLE.map((p) => p.key), PEOPLE.map((p) => p.email), PEOPLE.map((p) => String(p.avatar)), POSTS.map((p) => p.key), GROUPS.map((g) => g.slug)]) {
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('gives the demo account no history so its suggestions follow only what it does', () => {
    expect(SIGNALS.some((item) => item.user === 'maya')).toBe(false);
  });
});
