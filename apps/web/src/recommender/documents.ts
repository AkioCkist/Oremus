/**
 * What each kind of content "is about", as weighted text. The same builders describe a target when a
 * signal is recorded and a candidate when recommending, so both sides live in the same feature space.
 * Only text the public can see is used (no followers-only posts, no hidden About fields).
 */

import { describeFeeling } from '../shared/feelings.js';
import { analyze, type Analysis, type WeightedText } from './text.js';

const GROUP_TYPE_WORDS: Record<string, string> = {
  general: '', social: 'community', learning: 'learning study', hobbies: 'hobby', buy_sell: 'marketplace buy sell', gaming: 'gaming games',
  jobs: 'jobs career', parenting: 'parenting family', work: 'work career'
};

/** At most this much post text describes a person or a group. */
const RECENT_TEXT_LIMIT = 2500;

export const joinRecent = (texts: string[]) => {
  let out = '';
  for (const text of texts) { if (out.length >= RECENT_TEXT_LIMIT) break; out += `${text}\n`; }
  return out.slice(0, RECENT_TEXT_LIMIT);
};

export function postText(post: any, group?: { name?: string; tags?: string[] } | null, shared?: any): WeightedText[] {
  // Moods ("feeling excited") say nothing about a subject; activities do ("listening to Trịnh Công Sơn").
  const activity = post.feeling?.type === 'activity' ? describeFeeling(post.feeling) : null;
  return [
    [post.content, 1],
    [shared?.content, 0.7],
    [post.place?.name, 0.6],
    [activity?.text, 0.4],
    [group?.name, 0.5],
    [(group?.tags || []).join(', '), 0.5]
  ];
}

const publicField = (profile: any, field: string) => (profile?.audience?.[field] || 'public') === 'public';

export function userText(user: any, recentPosts: string[] = []): WeightedText[] {
  const profile = user.profile || {};
  // "Followers only" profiles show their details to followers alone (see visibleProfile), so only public posts describe them.
  if (profile.privacy === 'followers') return [[joinRecent(recentPosts), 1]];
  const hidden = new Set<string>(profile.introHidden || []);
  const work = publicField(profile, 'work') ? (profile.work || []).map((item: any) => `${item.position || ''} ${item.company || ''}`).join(', ') : '';
  const education = publicField(profile, 'education') ? (profile.education || []).map((item: any) => item.concentration || '').join(', ') : '';
  return [
    [profile.bio, 1.4],
    [hidden.has('hobbies') ? '' : (profile.hobbies || []).join(', '), 1.4],
    [profile.about, 0.8],
    [work, 0.8],
    [education, 0.6],
    [publicField(profile, 'location') ? profile.location : '', 0.3],
    [joinRecent(recentPosts), 0.7]
  ];
}

export function groupText(group: any, recentPosts: string[] = []): WeightedText[] {
  return [
    [group.name, 1.5],
    [(group.tags || []).join(', '), 1.5],
    [group.description, 1],
    [GROUP_TYPE_WORDS[group.groupType] || '', 0.5],
    [group.location, 0.3],
    [joinRecent(recentPosts), 0.6]
  ];
}

export function storyText(story: any, author?: any): WeightedText[] {
  const profile = author?.profile || {};
  return [
    [story.text, 1.5],
    [profile.bio, 0.5],
    [(profile.hobbies || []).join(', '), 0.5]
  ];
}

/** Search keywords; a lone lower-case "ai" in a search box means the technology, not "who". */
export function queryText(query: string): WeightedText[] {
  return [[query.replace(/(^|\s)ai(?=\s|$)/gi, '$1AI'), 1]];
}

export const describe = (parts: WeightedText[]): Analysis => analyze(parts);
