import { describe, expect, it } from 'vitest';
import { afterCursor, offsetChunk, parseOffsetCursor, parseTimeCursor, timeChunk, timeCursor } from '../utils/paginate.js';

const id = (n: number) => n.toString(16).padStart(24, '0');
const row = (n: number) => ({ _id: id(n), createdAt: new Date(Date.UTC(2026, 0, 1, 0, n)) });

describe('cursor pagination', () => {
  it('round-trips a time cursor', () => {
    const cursor = timeCursor(row(5));
    const parsed = parseTimeCursor(cursor);
    expect(parsed?.at.toISOString()).toBe('2026-01-01T00:05:00.000Z');
    expect(String(parsed?.id)).toBe(id(5));
  });

  it('rejects malformed cursors instead of passing them to MongoDB', () => {
    expect(parseTimeCursor('t123_not-an-id')).toBeNull();
    expect(parseTimeCursor({ $gt: '' })).toBeNull();
    expect(afterCursor('garbage')).toEqual({});
    expect(parseOffsetCursor('o-5')).toBe(0);
    expect(parseOffsetCursor('o99999999')).toBe(0);
  });

  it('builds a tie-safe "after" filter for both directions', () => {
    const cursor = timeCursor(row(5));
    const newer = afterCursor(cursor, 'createdAt', -1) as any;
    const older = afterCursor(cursor, 'createdAt', 1) as any;
    expect(newer.$or[0].createdAt.$lt).toEqual(row(5).createdAt);
    expect(newer.$or[1]._id.$lt.toString()).toBe(id(5));
    expect(older.$or[0].createdAt.$gt).toEqual(row(5).createdAt);
  });

  it('uses the extra row only to detect another chunk', () => {
    const full = timeChunk([row(9), row(8), row(7)], 2);
    expect(full.items.map((item) => item._id)).toEqual([id(9), id(8)]);
    expect(full.next).toBe(timeCursor(row(8)));
    expect(timeChunk([row(9), row(8)], 2).next).toBeNull();
    expect(offsetChunk([1, 2, 3], 2, 10)).toEqual({ items: [1, 2], next: 'o12' });
    expect(offsetChunk([1, 2], 2, 10).next).toBeNull();
  });
});
