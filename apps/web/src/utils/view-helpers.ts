// Formatting helpers exposed to every EJS view through app.locals.

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

/** Facebook-style relative time: "Just now", "12m", "5h", "3d", then a short date. */
export function timeAgo(value: Date | string | number, now = Date.now()): string {
  const date = new Date(value);
  const diff = now - date.getTime();
  if (diff < MINUTE) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function longTime(value: Date | string | number): string {
  return new Date(value).toLocaleString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function clockTime(value: Date | string | number): string {
  return new Date(value).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
}

/** Stable gradient class for an avatar without a photo. */
export function toneOf(seed: string): string {
  let hash = 0;
  for (const char of String(seed || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `tone-${hash % 8}`;
}

export function initials(name: string): string {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '')).toUpperCase();
}

export function firstName(name: string): string {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

export function compact(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${compact(count)} ${count === 1 ? one : many}`;
}

/** Extracts unique http(s) links from free text (used for "Shared links" in chat details). */
export function extractLinks(text: string): string[] {
  const matches = String(text || '').match(/https?:\/\/[^\s<>"']+/g) || [];
  return [...new Set(matches.map((url) => url.replace(/[.,!?;:)\]]+$/, '')))];
}

export const REACTION_LABELS: Record<string, { label: string; color: string }> = {
  like: { label: 'Like', color: 'text-[#0866ff]' },
  love: { label: 'Love', color: 'text-[#f33e58]' },
  haha: { label: 'Haha', color: 'text-[#e9a811]' },
  wow: { label: 'Wow', color: 'text-[#e9a811]' },
  sad: { label: 'Sad', color: 'text-[#e9a811]' },
  angry: { label: 'Angry', color: 'text-[#e9710f]' }
};

export const viewHelpers = { timeAgo, longTime, clockTime, toneOf, initials, firstName, compact, plural, extractLinks, REACTION_LABELS };
