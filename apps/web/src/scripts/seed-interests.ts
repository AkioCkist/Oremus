import { detectTopics } from '../recommender/text.js';
import { MIN_INTERESTS, interestOption } from '../shared/interests.js';
import { POSTS, type SeedPerson, type Topic } from './seed-data.js';

/** Seed topics that are not survey options, mapped to the closest one. */
const TOPIC_TO_INTEREST: Partial<Record<Topic, string>> = { nature: 'hiking', city: 'travel', work: 'tech', sport: 'football', general: '' };

/**
 * Survey answers for a sample person: given explicitly, "pending" (survey not taken), or derived from what their
 * profile and posts are about, the topics they post most and their hobbies as sub-interests.
 */
export function seedInterests(person: SeedPerson, answeredAt: Date) {
  if (person.interests === 'pending') return { topics: [], keywords: [], completedAt: null, skippedAt: null };
  if (person.interests) return { topics: person.interests.topics, keywords: person.interests.keywords || [], completedAt: answeredAt, skippedAt: null };
  const profile = person.profile as { bio?: string; about?: string; hobbies?: string[] };
  const posts = POSTS.filter((post) => post.author === person.key);
  const scores = new Map<string, number>();
  const add = (topic: string | undefined, score: number) => { if (topic && interestOption(topic)) scores.set(topic, (scores.get(topic) || 0) + score); };
  for (const [topic, matches] of detectTopics([profile.bio || '', (profile.hobbies || []).join(', '), profile.about || ''])) add(topic, 2 * matches);
  for (const [topic, matches] of detectTopics(posts.map((post) => post.text))) add(topic, matches);
  for (const post of posts) add(TOPIC_TO_INTEREST[post.topic] ?? post.topic, 1);
  const topics = [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([topic]) => topic);
  // Fewer than the survey minimum would be impossible to answer in the app; fall back to common picks.
  for (const fallback of ['travel', 'food', 'music']) if (topics.length < MIN_INTERESTS && !topics.includes(fallback)) topics.push(fallback);
  return { topics, keywords: (profile.hobbies || []).slice(0, 5), completedAt: answeredAt, skippedAt: null };
}
