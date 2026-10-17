/**
 * Interests picked in the onboarding survey, turned into signals the engine understands. They are not stored
 * as interactions: they are derived from the user document on every recommendation, so editing the survey
 * takes effect at once and "Clear history" never removes them. Their weight fades with a long half-life
 * (see engine.ts), so what someone actually does gradually takes over from what they said.
 */

import { interestOption } from '../shared/interests.js';
import { queryText } from './documents.js';
import type { Signal } from './engine.js';
import { analyze, TOPICS, topFeatures } from './text.js';

export type DeclaredInterests = { topics?: string[] | null; keywords?: string[] | null; completedAt?: Date | string | null; updatedAt?: Date | string | null };

/** How many lexicon terms describe a picked topic besides its name (the most typical ones come first). */
const TOPIC_TERMS = 8;

export function declaredSignals(interests: DeclaredInterests | null | undefined, now = Date.now()): Signal[] {
  if (!interests?.completedAt) return [];
  const createdAt = new Date(interests.completedAt);
  const at = Number.isNaN(createdAt.getTime()) ? new Date(now) : createdAt;
  const signals: Signal[] = [];
  for (const key of interests.topics || []) {
    const option = interestOption(key);
    const topic = TOPICS[key];
    if (!option || !topic) continue;
    const features = topFeatures(analyze([[option.label, 1.5], [topic.terms.slice(0, TOPIC_TERMS).join(', '), 0.6]]));
    signals.push({ type: 'interest', targetType: 'query', label: option.label, features, createdAt: at });
  }
  for (const keyword of interests.keywords || []) {
    const features = topFeatures(analyze(queryText(keyword)));
    if (features.length) signals.push({ type: 'interest', targetType: 'query', label: keyword, features, createdAt: at });
  }
  return signals;
}
