import { describe, expect, it } from 'vitest';
import { GROUPS, PEOPLE, POSTS, STORIES } from '../scripts/seed-data.js';

const photoId = (value: unknown) => String(Array.isArray(value) ? value[0] : value);
const repeats = (values: string[]) => values.filter((value, index) => values.indexOf(value) !== index);

describe('seed variety', () => {
  it('never gives two posts the same photo', () => {
    const photos = POSTS.flatMap((post) => (post.photos || []).map(photoId));
    expect(new Set(photos).size).toBe(photos.length);
  });

  it('never gives two posts the same caption', () => {
    const texts = POSTS.map((post) => post.text);
    expect(repeats(texts)).toEqual([]);
  });

  it('never repeats a story photo or a generated group cover', () => {
    const stories = STORIES.flatMap((story) => (story.photo === undefined ? [] : [photoId(story.photo)]));
    expect(new Set(stories).size).toBe(stories.length);
    const covers = GROUPS.map((group) => String(group.cover)).filter((cover) => cover.startsWith('commons-'));
    expect(new Set(covers).size).toBe(covers.length);
  });

  it('mixes photo stories with text stories on varied backgrounds', () => {
    const crowd = STORIES.filter((story) => story.author.startsWith('crowd'));
    const text = crowd.filter((story) => !story.photo);
    expect(text.length).toBeGreaterThan(100);
    expect(crowd.length - text.length).toBeGreaterThan(100);
    expect(new Set(text.map((story) => story.background)).size).toBeGreaterThan(6);
  });

  it('gives the crowd real portraits instead of generated art', () => {
    const crowd = PEOPLE.filter((person) => person.key.startsWith('crowd'));
    expect(crowd.every((person) => /^(xsgames|randomuser)-(female|male)-\d+$/.test(String(person.avatar)))).toBe(true);
  });
});
