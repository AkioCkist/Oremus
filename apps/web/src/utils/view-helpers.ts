// Formatting helpers exposed to every EJS view through app.locals.
import { describeFeeling } from '../shared/feelings.js';
import { STORY_ANIMATION_LABELS, STORY_BACKGROUNDS, STORY_COLORS, STORY_EFFECT_LABELS, STORY_FONT_LABELS, storyTextAttrs } from '../shared/story-style.js';

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

/** Escapes text and turns its http(s) links into anchors (chat bubbles, where shared posts arrive as links). */
export function linkify(text: string): string {
  return String(text || '').split(/(https?:\/\/[^\s<>"']+)/g).map((part, index) => {
    if (index % 2 === 0) return escapeHtml(part);
    const url = part.replace(/[.,!?;:)\]]+$/, ''), rest = part.slice(url.length);
    return `<a class="underline" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>${escapeHtml(rest)}`;
  }).join('');
}

export const REACTION_LABELS: Record<string, { label: string; color: string }> = {
  like: { label: 'Like', color: 'text-[#0088ff]' },
  love: { label: 'Love', color: 'text-[#ff2d55]' },
  haha: { label: 'Haha', color: 'text-[#e9a811]' },
  wow: { label: 'Wow', color: 'text-[#e9a811]' },
  sad: { label: 'Sad', color: 'text-[#e9a811]' },
  angry: { label: 'Angry', color: 'text-[#e9710f]' }
};

export const RELATIONSHIP_LABELS: Record<string, string> = {
  single: 'Single', in_relationship: 'In a relationship', engaged: 'Engaged', married: 'Married', civil_union: 'In a civil union',
  domestic_partnership: 'In a domestic partnership', open_relationship: 'In an open relationship', complicated: "It's complicated",
  separated: 'Separated', divorced: 'Divorced', widowed: 'Widowed'
};
export const GENDER_LABELS: Record<string, string> = { male: 'Male', female: 'Female', nonbinary: 'Non-binary', other: 'Other' };
export const PLATFORM_LABELS: Record<string, string> = {
  website: 'Website', facebook: 'Facebook', instagram: 'Instagram', x: 'X', threads: 'Threads', tiktok: 'TikTok', youtube: 'YouTube',
  linkedin: 'LinkedIn', github: 'GitHub', discord: 'Discord', other: 'Link'
};
export const AUDIENCE_LABELS: Record<string, { label: string; icon: string }> = {
  public: { label: 'Public', icon: 'i-globe' }, friends: { label: 'Friends', icon: 'i-users' }, only_me: { label: 'Only me', icon: 'i-lock' }
};
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "13 Jul 2023" — dates of a workplace entry. */
export function shortDate(value?: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** Facebook-style tenure: "3 years, 2 months". */
export function duration(start?: Date | string | null, end?: Date | string | null, now = Date.now()): string {
  if (!start) return '';
  const from = new Date(start), to = end ? new Date(end) : new Date(now);
  let months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() - (to.getDate() < from.getDate() ? 1 : 0);
  if (months < 1) return 'Less than a month';
  const years = Math.floor(months / 12); months %= 12;
  return [years ? `${years} year${years === 1 ? '' : 's'}` : '', months ? `${months} month${months === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
}

/** "15 July" (+ year when given). */
export function birthdayText(day?: number | null, month?: number | null, year?: number | null): string {
  if (!day || !month) return year ? String(year) : '';
  return `${day} ${MONTHS[month - 1]}${year ? ` ${year}` : ''}`;
}

/** Display text for a profile link without the protocol and trailing slash. */
export function linkLabel(url: string): string {
  return String(url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

/** Escapes text that a view builds into an HTML string before printing it unescaped. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

export const viewHelpers = { escapeHtml, describeFeeling, timeAgo, longTime, clockTime, toneOf, initials, firstName, compact, plural, extractLinks, linkify, REACTION_LABELS, RELATIONSHIP_LABELS, GENDER_LABELS, PLATFORM_LABELS, AUDIENCE_LABELS, MONTHS, shortDate, duration, birthdayText, linkLabel, storyTextAttrs, STORY_BACKGROUNDS, STORY_COLORS, STORY_FONT_LABELS, STORY_EFFECT_LABELS, STORY_ANIMATION_LABELS };
