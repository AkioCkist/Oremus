import mongoose from 'mongoose';

/**
 * Cursor pagination for "endless" lists (feeds, comments, chats, notifications…).
 *
 * Time cursors (`t<ms>_<id>`) point at the last item already shown, so new items arriving at the top
 * never shift later pages (no duplicates, nothing skipped). Lists ordered by something other than time
 * (member count, reactions, the feed's follow order) use offset cursors (`o<n>`).
 */

export type Chunk<T> = { items: T[]; next: string | null };

type Sortable = { _id: unknown } & Record<string, unknown>;

export function timeCursor(doc: Sortable, field = 'createdAt'): string {
  return `t${new Date(doc[field] as string | Date).getTime()}_${String(doc._id)}`;
}

export function parseTimeCursor(raw: unknown): { at: Date; id: mongoose.Types.ObjectId } | null {
  const match = /^t(\d{1,15})_([a-f0-9]{24})$/.exec(String(raw ?? ''));
  return match ? { at: new Date(Number(match[1])), id: new mongoose.Types.ObjectId(match[2]) } : null;
}

export function parseOffsetCursor(raw: unknown, max = 10_000): number {
  const match = /^o(\d{1,6})$/.exec(String(raw ?? ''));
  return match ? Math.min(Number(match[1]), max) : 0;
}

/**
 * Mongo filter for "items after the cursor" in a list sorted by `{ [field]: dir, _id: dir }`.
 * Returns {} when there is no cursor (first chunk).
 */
export function afterCursor(raw: unknown, field = 'createdAt', dir: 1 | -1 = -1): Record<string, unknown> {
  const cursor = parseTimeCursor(raw);
  if (!cursor) return {};
  const op = dir === -1 ? '$lt' : '$gt';
  return { $or: [{ [field]: { [op]: cursor.at } }, { [field]: cursor.at, _id: { [op]: cursor.id } }] };
}

/** The sort that matches `afterCursor`. */
export const cursorSort = (field = 'createdAt', dir: 1 | -1 = -1) => ({ [field]: dir, _id: dir }) as Record<string, 1 | -1>;

/**
 * Turns `limit + 1` fetched rows into a chunk: the extra row only proves another chunk exists,
 * so no separate count query is needed.
 */
export function timeChunk<T extends Sortable>(rows: T[], limit: number, field = 'createdAt'): Chunk<T> {
  const items = rows.slice(0, limit);
  return { items, next: rows.length > limit && items.length ? timeCursor(items[items.length - 1]!, field) : null };
}

export function offsetChunk<T>(rows: T[], limit: number, offset: number): Chunk<T> {
  return { items: rows.slice(0, limit), next: rows.length > limit ? `o${offset + limit}` : null };
}
