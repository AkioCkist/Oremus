import { describe, expect, it } from 'vitest';
import { buildStoryTray, canViewStory } from '../services/story.service.js';
import { groupJoinSchema, groupSchema, postEditSchema, postSchema, profileDetailsSchema, profileListItemSchemas, profilePhotoSchema, searchRecordSchema, storyReactionSchema, storyReplySchema, storySchema } from '../validators/index.js';
import { extractLinks, initials, timeAgo, toneOf } from '../utils/view-helpers.js';
import { describeFeeling } from '../shared/feelings.js';
import { storyInk, storyTextAttrs } from '../shared/story-style.js';

const author = (id: string, name: string) => ({ _id: id, username: name.toLowerCase(), displayName: name, profile: { avatarUrl: '' } });
const story = (id: string, who: ReturnType<typeof author>, minutesAgo: number) => ({ _id: id, authorId: who, text: id, background: 'ocean', media: null, viewCount: 2, createdAt: new Date(Date.now() - minutesAgo * 60_000) });

describe('story audience', () => {
  it('lets authors, followers and anyone for public stories view', () => {
    const following = new Set(['b']);
    expect(canViewStory({ authorId: 'a', audience: 'followers' }, 'a', new Set())).toBe(true);
    expect(canViewStory({ authorId: 'b', audience: 'followers' }, 'a', following)).toBe(true);
    expect(canViewStory({ authorId: 'c', audience: 'public' }, 'a', following)).toBe(true);
    expect(canViewStory({ authorId: 'c', audience: 'followers' }, 'a', following)).toBe(false);
  });
});

describe('story tray', () => {
  const me = author('me', 'Maya Tran'), leo = author('leo', 'Leo Minh'), ana = author('ana', 'Anika Rao');
  const stories = [story('s1', leo, 300), story('s2', ana, 200), story('s3', leo, 100), story('s4', me, 50), story('s5', ana, 10)];

  it('groups by author, puts you first, then unseen, then most recent', () => {
    const tray = buildStoryTray(stories, [{ storyId: 's2' }, { storyId: 's5' }], 'me');
    expect(tray.map((group) => group.author._id)).toEqual(['me', 'leo', 'ana']);
    expect(tray[1]!.stories.map((item) => item.id)).toEqual(['s1', 's3']);
    expect(tray[2]!.hasUnseen).toBe(false);
  });

  it('starts each author at the first unseen story and keeps reactions', () => {
    const tray = buildStoryTray(stories, [{ storyId: 's1', reaction: 'love' }], 'me');
    const leoGroup = tray.find((group) => group.author._id === 'leo')!;
    expect(leoGroup.startIndex).toBe(1);
    expect(leoGroup.stories[0]!.myReaction).toBe('love');
  });

  it('only exposes view counts to the author', () => {
    const tray = buildStoryTray(stories, [], 'me');
    expect(tray[0]!.stories[0]!.viewCount).toBe(2);
    expect(tray[1]!.stories[0]!.viewCount).toBeUndefined();
  });
});

describe('story validation', () => {
  it('defaults the background and caps text length', () => {
    expect(storySchema.parse({}).background).toBe('ocean');
    expect(() => storySchema.parse({ text: 'x'.repeat(251) })).toThrow();
    expect(() => storySchema.parse({ background: 'neon' })).toThrow();
  });
  it('folds the flat text-style fields into a style object', () => {
    const parsed = storySchema.parse({ text: 'Hi', font: 'script', textColor: '#FF3B30', textAlign: 'left', textEffect: 'neon', textAnimation: 'bounce', textSize: '1.5', textX: '20', textY: '80' });
    expect(parsed.style).toEqual({ font: 'script', color: '#ff3b30', align: 'left', effect: 'neon', animation: 'bounce', size: 1.5, x: 20, y: 80 });
    expect(storySchema.parse({}).style).toMatchObject({ font: 'classic', color: '#ffffff', effect: 'shadow', x: 50, y: 50 });
    expect(() => storySchema.parse({ font: 'comic' })).toThrow();
    expect(() => storySchema.parse({ textColor: 'red' })).toThrow();
    expect(() => storySchema.parse({ textSize: '9' })).toThrow();
  });
  it('accepts the five story reactions only', () => {
    expect(storyReactionSchema.parse({ type: 'haha' }).type).toBe('haha');
    expect(() => storyReactionSchema.parse({ type: 'wow' })).toThrow();
  });
  it('requires reply text', () => expect(() => storyReplySchema.parse({ content: '   ' })).toThrow());
});

describe('view helpers', () => {
  it('formats relative time like Facebook', () => {
    const now = Date.now();
    expect(timeAgo(now - 10_000, now)).toBe('Just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3h');
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe('2d');
  });
  it('builds initials and a stable tone', () => {
    expect(initials('Maya Tran')).toBe('MT');
    expect(initials('leo')).toBe('L');
    expect(toneOf('Maya Tran')).toBe(toneOf('Maya Tran'));
    expect(toneOf('Maya Tran')).toMatch(/^tone-[0-7]$/);
  });
  it('extracts unique links from chat text', () => {
    expect(extractLinks('see https://a.dev/x and https://a.dev/x, http://b.io')).toEqual(['https://a.dev/x', 'http://b.io']);
  });
});

describe('profile popups validation', () => {
  it('accepts partial profile updates without filling defaults', () => {
    expect(profileDetailsSchema.parse({ bio: 'Hi' })).toEqual({ bio: 'Hi' });
    expect(() => profileDetailsSchema.parse({ username: 'no spaces' })).toThrow();
  });
  it('parses About details posted as flat form fields', () => {
    const parsed: any = profileDetailsSchema.parse({ 'audience.location': 'friends', 'intro.work': '0', 'intro.links': '1', languages: 'Vietnamese, English, vietnamese, English', birthDay: '15', birthMonth: '7', birthYear: '' });
    expect(parsed).toEqual({ audience: { location: 'friends' }, intro: { work: false, links: true }, languages: ['Vietnamese', 'English', 'vietnamese'], birthDay: 15, birthMonth: 7, birthYear: null });
    expect(() => profileDetailsSchema.parse({ birthDay: '31', birthMonth: '2' })).toThrow();
    expect(() => profileDetailsSchema.parse({ 'audience.location': 'everyone' })).toThrow();
  });
  it('validates workplace, school and link entries', () => {
    const job = profileListItemSchemas.work.parse({ company: 'Vietnamese Editor Community', position: 'Administrator', startDate: '2023-07-13', endDate: '', current: 'true' });
    expect(job).toMatchObject({ company: 'Vietnamese Editor Community', current: true, endDate: null });
    expect(() => profileListItemSchemas.work.parse({ company: 'A', startDate: '2024-01-01', endDate: '2023-01-01', current: '0' })).toThrow();
    expect(profileListItemSchemas.education.parse({ school: 'VNUK', startYear: '2023', endYear: '', graduated: '0' })).toMatchObject({ startYear: 2023, endYear: null, graduated: false, level: 'college' });
    expect(() => profileListItemSchemas.links.parse({ url: 'javascript:alert(1)' })).toThrow();
  });
  it('requires a photo kind and coerces remove', () => {
    expect(profilePhotoSchema.parse({ kind: 'cover', remove: 'true' }).remove).toBe(true);
    expect(() => profilePhotoSchema.parse({ kind: 'banner' })).toThrow();
  });
});

describe('group creation options', () => {
  it('forces public groups to stay visible and dedupes topics', () => {
    const group = groupSchema.parse({ name: 'Runners', privacy: 'public', visibility: 'hidden', tags: ['Run', 'run'] });
    expect(group.visibility).toBe('visible');
    expect(group.tags).toEqual(['run']);
    expect(group.settings).toEqual({ whoCanPost: 'anyone', postApproval: false, whoCanApprove: 'admins' });
  });
  it('keeps private groups hidden when asked and caps rules and questions', () => {
    expect(groupSchema.parse({ name: 'Secret club', privacy: 'private', visibility: 'hidden' }).visibility).toBe('hidden');
    expect(() => groupSchema.parse({ name: 'Too many', questions: ['a', 'b', 'c', 'd'] })).toThrow();
    expect(() => groupSchema.parse({ name: 'Too many', rules: Array.from({ length: 11 }, () => ({ title: 'x' })) })).toThrow();
    expect(() => groupSchema.parse({ name: 'Bad type', groupType: 'casino' })).toThrow();
  });
  it('accepts join answers and rule agreement', () => {
    expect(groupJoinSchema.parse({})).toEqual({ answers: [], agreeRules: false });
    expect(groupJoinSchema.parse({ answers: ['Fuji X100'], agreeRules: true }).agreeRules).toBe(true);
  });
});

describe('post feeling and check-in', () => {
  it('parses feeling and place sent as multipart JSON strings', () => {
    const post = postSchema.parse({ content: '', feeling: '{"type":"feeling","key":"happy"}', place: '{"id":"W1","name":"Cầu Rồng","address":"Đà Nẵng","lat":16.06,"lon":108.22}' });
    expect(post.feeling).toEqual({ type: 'feeling', key: 'happy' });
    expect(post.place?.name).toBe('Cầu Rồng');
    expect(postSchema.parse({ feeling: '', place: '' })).toMatchObject({ feeling: null, place: null });
  });
  it('rejects unknown feelings, empty activities and impossible coordinates', () => {
    expect(() => postSchema.parse({ feeling: '{"type":"feeling","key":"hacked"}' })).toThrow();
    expect(() => postSchema.parse({ feeling: '{"type":"activity","key":"eating","text":" "}' })).toThrow();
    expect(() => postSchema.parse({ place: '{"name":"Nowhere","lat":200,"lon":0}' })).toThrow();
  });
  it('describes feelings and activities like Facebook', () => {
    expect(describeFeeling({ type: 'feeling', key: 'happy' })).toEqual({ emoji: '😊', text: 'feeling happy' });
    expect(describeFeeling({ type: 'activity', key: 'eating', text: 'phở' })).toEqual({ emoji: '🍜', text: 'eating phở' });
    expect(describeFeeling(null)).toBeNull();
  });
});

describe('post photo editing', () => {
  it('accepts a layout of kept photos and new upload slots', () => {
    const edit = postEditSchema.parse({ content: '', layout: '[{"id":"abc"},{"upload":0}]' });
    expect(edit.layout).toEqual([{ id: 'abc' }, { upload: 0 }]);
    expect(postEditSchema.parse({ content: 'Only text' }).layout).toBeNull();
  });
  it('edits audience, feeling and check-in; missing means unchanged, empty means removed', () => {
    const untouched = postEditSchema.parse({ content: 'Hi' });
    expect(untouched.feeling).toBeUndefined();
    expect(untouched.place).toBeUndefined();
    const edit = postEditSchema.parse({ content: 'Hi', visibility: 'private', feeling: '', place: JSON.stringify({ name: 'Cầu Rồng', lat: 16.06, lon: 108.22 }) });
    expect(edit).toMatchObject({ visibility: 'private', feeling: null, place: { name: 'Cầu Rồng', address: '', id: '' } });
    expect(() => postEditSchema.parse({ content: 'Hi', visibility: 'friends' })).toThrow();
    expect(() => postEditSchema.parse({ content: 'Hi', feeling: '{"type":"feeling","key":"nope"}' })).toThrow();
  });
  it('allows any number of media and rejects bad slots', () => {
    const many = Array.from({ length: 12 }, (_, i) => (i % 2 ? { id: String(i) } : { upload: i }));
    expect(postEditSchema.parse({ layout: JSON.stringify(many) }).layout).toEqual(many);
    expect(() => postEditSchema.parse({ layout: '[{"upload":-1}]' })).toThrow();
    expect(() => postEditSchema.parse({ layout: '[{"other":1}]' })).toThrow();
  });
});

describe('search history input', () => {
  it('normalizes keywords and validates what can be remembered', async () => {
    const { normalizeQuery } = await import('../services/search.service.js');
    expect(normalizeQuery('  nguyễn   tuấn  ')).toBe('nguyễn tuấn');
    expect(normalizeQuery('x'.repeat(200))).toHaveLength(80);
    expect(searchRecordSchema.parse({ kind: 'query', query: ' oremus ' })).toEqual({ kind: 'query', query: 'oremus' });
    expect(searchRecordSchema.parse({ kind: 'user', id: '6aca5eeb7f6377b32c0c6c49' })).toEqual({ kind: 'user', id: '6aca5eeb7f6377b32c0c6c49' });
    expect(() => searchRecordSchema.parse({ kind: 'user', id: '../admin' })).toThrow();
    expect(() => searchRecordSchema.parse({ kind: 'post', id: '6aca5eeb7f6377b32c0c6c49' })).toThrow();
  });
});

describe('comment editing', () => {
  it('requires non-empty text within the limit', async () => {
    const { commentEditSchema } = await import('../validators/index.js');
    expect(commentEditSchema.parse({ content: '  fixed typo ' })).toEqual({ content: 'fixed typo' });
    expect(() => commentEditSchema.parse({ content: '   ' })).toThrow();
    expect(() => commentEditSchema.parse({ content: 'x'.repeat(1501) })).toThrow();
  });
});

describe('story text styling', () => {
  it('builds classes and CSS variables, animating only on request', () => {
    const attrs = storyTextAttrs({ font: 'retro', effect: 'highlight', align: 'right', animation: 'zoom', color: '#FFCC00', size: 2, x: 30, y: 70 });
    expect(attrs.className).toBe('story-text story-font-retro story-fx-highlight story-align-right');
    expect(attrs.style).toContain('--story-color:#ffcc00;--story-ink:#000000;--story-size:2;left:30%;top:70%');
    expect(storyTextAttrs({ animation: 'zoom' }, true).className).toContain('story-anim-zoom');
  });
  it('falls back to safe defaults for unknown or out-of-range values', () => {
    const attrs = storyTextAttrs({ font: 'x' as never, color: 'url(evil)', size: 99, x: -5 });
    expect(attrs.className).toContain('story-font-classic');
    expect(attrs.style).toContain('--story-color:#ffffff');
    expect(attrs.style).toContain('--story-size:2.5');
    expect(attrs.style).toContain('left:0%');
  });
  it('picks a readable ink colour', () => {
    expect(storyInk('#ffffff')).toBe('#000000');
    expect(storyInk('#0a84ff')).toBe('#ffffff');
  });
});
