/**
 * The recommender's model, kept free of I/O so it can be unit-tested:
 *
 * 1. `buildProfile` turns behaviour signals into an interest vector. Each signal contributes the target's
 *    keywords, weighted by how strong the signal is (a search or a long read counts more than a glance),
 *    with diminishing returns for repeats and exponential time decay, so recent interests win.
 * 2. `computeIdf` weighs features by how rare they are across everything that can be recommended.
 * 3. `rankDocuments` scores candidates: TF-IDF cosine similarity with the profile (the main term),
 *    plus affinity for authors/groups you engaged with, social proof, popularity and freshness.
 *    Every result carries a human reason ("Because you searched “coffee”").
 */

import { featureLabel, isTopic, topicLabel, type Feature, type Vector } from './text.js';

export type SignalType = 'search' | 'open' | 'click' | 'dwell' | 'react' | 'comment' | 'share' | 'follow' | 'join' | 'story_view';
export type TargetType = 'query' | 'post' | 'user' | 'group' | 'story';

export type Signal = {
  type: SignalType;
  targetType: TargetType;
  targetId?: string | null;
  authorId?: string | null;
  groupId?: string | null;
  label?: string;
  durationMs?: number;
  features: Feature[];
  createdAt: Date | string;
};

export type Source = { type: SignalType; targetType: TargetType; label: string };

export type Profile = {
  /** Interest per feature, L2-normalised. */
  terms: Vector;
  /** The signal that contributed most to each feature, used to explain results. */
  sources: Map<string, Source>;
  /** Readable spelling of features. */
  surface: Map<string, string>;
  /** Engagement with authors and groups, scaled 0..1. */
  authors: Map<string, number>;
  groups: Map<string, number>;
  /** Targets the user has clearly already seen. */
  seen: { post: Set<string>; user: Set<string>; group: Set<string>; story: Set<string> };
  signalCount: number;
};

const DAY = 86_400_000;
/** Days until a signal counts half as much. Search intent fades faster than engagement. */
const HALF_LIFE_DAYS: Record<SignalType, number> = { search: 10, open: 21, click: 14, dwell: 21, react: 30, comment: 30, share: 30, follow: 45, join: 45, story_view: 7 };
const BASE_WEIGHT: Record<SignalType, number> = { search: 3, open: 1.5, click: 1, dwell: 3, react: 2, comment: 3, share: 3, follow: 2.5, join: 3, story_view: 1 };
/** Opening a profile or group says more about your interests than opening a single post. */
const OPEN_TARGET_WEIGHT: Partial<Record<TargetType, number>> = { user: 2, group: 2, post: 1.5, story: 1 };
/** Reading time saturates: ~20 s gives two thirds of the maximum, a minute is nearly all of it. */
const DWELL_SATURATION_MS = 20_000;
const DWELL_CAP_MS = 120_000;
export const MIN_DWELL_MS = 1500;
const MAX_REPEAT = 5;
const PROFILE_SIZE = 300;

export const decay = (ageMs: number, halfLifeDays: number) => Math.pow(0.5, Math.max(ageMs, 0) / (halfLifeDays * DAY));

const sourceLabel = (signal: Signal) => (signal.label || '').trim();

/** Strength of a group of identical signals (same type and target). */
export function signalStrength(group: Signal[], now: number): number {
  const latest = group.reduce((max, signal) => Math.max(max, new Date(signal.createdAt).getTime()), 0);
  const first = group[0]!;
  const freshness = decay(now - latest, HALF_LIFE_DAYS[first.type]);
  if (first.type === 'dwell') {
    const total = group.reduce((sum, signal) => sum + Math.min(Math.max(signal.durationMs || 0, 0), DWELL_CAP_MS), 0);
    if (total < MIN_DWELL_MS) return 0;
    return BASE_WEIGHT.dwell * (1 - Math.exp(-total / DWELL_SATURATION_MS)) * freshness;
  }
  const base = first.type === 'open' ? OPEN_TARGET_WEIGHT[first.targetType] ?? BASE_WEIGHT.open : BASE_WEIGHT[first.type];
  return base * (1 + Math.log(Math.min(group.length, MAX_REPEAT))) * freshness;
}

const scaleToOne = (map: Map<string, number>) => {
  const max = Math.max(0, ...map.values());
  return max ? new Map([...map].map(([key, value]) => [key, value / max])) : map;
};

export function buildProfile(signals: Signal[], now = Date.now()): Profile {
  const groups = new Map<string, Signal[]>();
  for (const signal of signals) {
    const target = signal.targetType === 'query' ? `q:${(signal.label || '').toLowerCase()}` : String(signal.targetId || '');
    if (!target || target === 'q:') continue;
    const key = `${signal.type}|${signal.targetType}|${target}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(signal);
  }

  const terms = new Map<string, number>();
  const best = new Map<string, { value: number; source: Source }>();
  const surface = new Map<string, string>();
  const authors = new Map<string, number>();
  const groupAffinity = new Map<string, number>();
  const seen = { post: new Set<string>(), user: new Set<string>(), group: new Set<string>(), story: new Set<string>() };

  for (const group of groups.values()) {
    const strength = signalStrength(group, now);
    if (strength <= 0) continue;
    // The newest signal in the group carries the freshest snapshot of the target's keywords.
    const latest = [...group].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]!;
    const source: Source = { type: latest.type, targetType: latest.targetType, label: sourceLabel(latest) };
    for (const feature of latest.features) {
      const value = strength * feature.w;
      terms.set(feature.t, (terms.get(feature.t) || 0) + value);
      if (feature.s && !surface.has(feature.t)) surface.set(feature.t, feature.s);
      const current = best.get(feature.t);
      if (!current || value > current.value) best.set(feature.t, { value, source });
    }
    if (latest.authorId) authors.set(String(latest.authorId), (authors.get(String(latest.authorId)) || 0) + strength);
    if (latest.groupId) groupAffinity.set(String(latest.groupId), (groupAffinity.get(String(latest.groupId)) || 0) + strength);
    if (latest.targetId && latest.targetType !== 'query') {
      const id = String(latest.targetId);
      // A glance (short dwell) doesn't count as seen; opening, reacting or reading for a while does.
      const total = group.reduce((sum, signal) => sum + (signal.durationMs || 0), 0);
      if (latest.type !== 'dwell' || total >= 8000) seen[latest.targetType as keyof Profile['seen']].add(id);
    }
  }

  const top = [...terms].sort((a, b) => b[1] - a[1]).slice(0, PROFILE_SIZE);
  let length = 0;
  for (const [, value] of top) length += value * value;
  length = Math.sqrt(length);
  return {
    terms: new Map(length ? top.map(([token, value]) => [token, value / length]) : []),
    sources: new Map(top.map(([token]) => [token, best.get(token)!.source])),
    surface, authors: scaleToOne(authors), groups: scaleToOne(groupAffinity), seen,
    signalCount: signals.length
  };
}

/** Smoothed inverse document frequency over every candidate vector. */
export function computeIdf(vectors: Vector[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const vector of vectors) for (const token of vector.keys()) df.set(token, (df.get(token) || 0) + 1);
  const total = vectors.length;
  const idf = new Map([...df].map(([token, count]) => [token, Math.log((total + 1) / (count + 1)) + 1]));
  // Features no candidate has are as rare as it gets; stored under the empty key (never a real token).
  idf.set('', Math.log(total + 1) + 1);
  return idf;
}
const idfOf = (idf: Map<string, number>, token: string) => idf.get(token) ?? idf.get('') ?? 1;

export type Match = { similarity: number; token: string | null };

/** Cosine similarity of profile and document after IDF weighting, plus the feature that matched best. */
export function similarity(profile: Vector, profileNorm: number, doc: Vector, idf: Map<string, number>): Match {
  if (!profileNorm || !doc.size) return { similarity: 0, token: null };
  let dot = 0, docNorm = 0, bestValue = 0;
  let token: string | null = null;
  for (const [term, weight] of doc) {
    const w = weight * idfOf(idf, term);
    docNorm += w * w;
    const p = profile.get(term);
    if (p) {
      const contribution = p * idfOf(idf, term) * w;
      dot += contribution;
      // Prefer a concrete keyword over a broad topic when both explain the match about equally.
      const score = isTopic(term) ? contribution * 0.8 : contribution;
      if (score > bestValue) { bestValue = score; token = term; }
    }
  }
  return { similarity: docNorm ? dot / (profileNorm * Math.sqrt(docNorm)) : 0, token };
}

export function profileNorm(profile: Vector, idf: Map<string, number>): number {
  let sum = 0;
  for (const [term, weight] of profile) { const w = weight * idfOf(idf, term); sum += w * w; }
  return Math.sqrt(sum);
}

export type Candidate = {
  id: string;
  vector: Vector;
  authorId?: string | null;
  groupId?: string | null;
  /** 0..1 social proof (mutual friends, friends in the group). */
  social?: number;
  socialReason?: string;
  /** 0..1 engagement relative to the rest of the pool. */
  popularity?: number;
  /** 0..1, 1 = brand new. */
  freshness?: number;
  /** Subtracted from the score (already seen, etc.). */
  penalty?: number;
};

export type Reason = { code: 'search' | 'read' | 'engaged' | 'viewed' | 'topic' | 'social' | 'popular' | 'new'; text: string };
export type Ranked<T extends Candidate> = T & { score: number; relevance: number; similarity: number; reason: Reason };

const WEIGHTS = { relevance: 6, affinity: 1.5, social: 1.2, popularity: 0.8, freshness: 0.5 };
/**
 * A content match is the stated reason when it is close to the best match in the pool, or clearly similar on
 * its own (so a second, weaker interest still explains its results). Below both it is noise.
 */
const REASON_RELATIVE = 0.35;
const REASON_ABSOLUTE = 0.15;
/**
 * Similarity that counts as a strong match. Relevance is relative to the best match in the pool, but never to
 * less than this, so when nothing in the pool really fits, weak matches stay weak instead of looking perfect.
 */
const STRONG_SIMILARITY = 0.25;

export function explain(token: string | null, profile: Profile): Reason | null {
  if (!token) return null;
  const source = profile.sources.get(token);
  const what = featureLabel(token, profile.surface.get(token));
  if (source?.type === 'search' && source.label) return { code: 'search', text: `Because you searched “${source.label}”` };
  if (isTopic(token)) {
    if (source?.type === 'dwell') return { code: 'read', text: `Because you spent time reading about ${topicLabel(token).toLowerCase()}` };
    return { code: 'topic', text: `Based on your interest in ${topicLabel(token).toLowerCase()}` };
  }
  if (source?.type === 'dwell') return { code: 'read', text: `Because you read posts about “${what}”` };
  if (source && ['react', 'comment', 'share'].includes(source.type)) return { code: 'engaged', text: `Because you engaged with posts about “${what}”` };
  if (source && ['open', 'click', 'follow', 'join', 'story_view'].includes(source.type) && source.label) {
    const text = source.targetType === 'post' ? `Similar to posts you opened about “${what}”` : source.targetType === 'story' ? `Similar to ${source.label}’s story` : `Similar to ${source.label}`;
    return { code: 'viewed', text };
  }
  return { code: 'topic', text: `Matches your interest in “${what}”` };
}

/**
 * Orders candidates by personal relevance. Relevance is relative to the best match in this pool, so the
 * top content match always reaches the full relevance weight and priors only break ties among weak matches.
 */
export function rankDocuments<T extends Candidate>(candidates: T[], profile: Profile, idf: Map<string, number>, fallback: (candidate: T) => Reason): Array<Ranked<T>> {
  const norm = profileNorm(profile.terms, idf);
  const matches = candidates.map((candidate) => similarity(profile.terms, norm, candidate.vector, idf));
  const maxSimilarity = Math.max(0, ...matches.map((match) => match.similarity));
  return candidates.map((candidate, index) => {
    const match = matches[index]!;
    const relevance = maxSimilarity > 0 ? match.similarity / Math.max(maxSimilarity, STRONG_SIMILARITY) : 0;
    const affinity = Math.max(candidate.authorId ? profile.authors.get(String(candidate.authorId)) || 0 : 0, candidate.groupId ? profile.groups.get(String(candidate.groupId)) || 0 : 0);
    const score = WEIGHTS.relevance * relevance + WEIGHTS.affinity * affinity + WEIGHTS.social * (candidate.social || 0)
      + WEIGHTS.popularity * (candidate.popularity || 0) + WEIGHTS.freshness * (candidate.freshness || 0) - (candidate.penalty || 0);
    const reason = (relevance >= REASON_RELATIVE || match.similarity >= REASON_ABSOLUTE ? explain(match.token, profile) : null) || fallback(candidate);
    return { ...candidate, score: Math.round(score * 1000) / 1000, relevance: Math.round(relevance * 1000) / 1000, similarity: Math.round(match.similarity * 1000) / 1000, reason };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Keeps the ranking but allows at most `perKey` results that share a key (e.g. the same author). */
export function diversify<T>(items: T[], keyOf: (item: T) => string | null | undefined, perKey: number, limit: number): T[] {
  const counts = new Map<string, number>();
  const picked: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (key) {
      const count = counts.get(key) || 0;
      if (count >= perKey) continue;
      counts.set(key, count + 1);
    }
    picked.push(item);
    if (picked.length >= limit) break;
  }
  return picked;
}

export type Interest = { token: string; label: string; weight: number; topic: boolean };

/** Strongest interests for display: topics first, then distinctive keywords (bigrams preferred over their parts). */
export function topInterests(profile: Profile, limit = 10): Interest[] {
  const entries = [...profile.terms].sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] || 1;
  const topics = entries.filter(([token]) => isTopic(token)).slice(0, Math.ceil(limit / 2));
  const keywords: Array<[string, number]> = [];
  // A phrase ("machine learning") reads better than its words: strong phrases are picked before single words.
  const words = entries.filter(([token]) => !isTopic(token));
  const strongest = words[0]?.[1] || 0;
  const phrasesFirst = [...words.filter(([token, value]) => token.includes('_') && value >= strongest * 0.4), ...words];
  for (const entry of phrasesFirst) {
    if (keywords.some(([token]) => token === entry[0])) continue;
    const covered = keywords.some(([token]) => token.split('_').includes(entry[0]) || entry[0].split('_').includes(token));
    if (!covered) keywords.push(entry);
    if (topics.length + keywords.length >= limit) break;
  }
  keywords.sort((a, b) => b[1] - a[1]);
  return [...topics, ...keywords].slice(0, limit)
    .map(([token, value]) => ({ token, label: featureLabel(token, profile.surface.get(token)), weight: Math.round((value / max) * 100) / 100, topic: isTopic(token) }));
}
