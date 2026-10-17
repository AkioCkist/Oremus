import { User } from '../models/index.js';
import { invalidateCacheKeys } from './cache.service.js';

/**
 * Onboarding survey: before using Oremus, every signed-in account picks its interests (or skips). The answers
 * feed recommendations through recommender/interests.ts.
 */

type InterestState = { completedAt?: Date | null; skippedAt?: Date | null } | null | undefined;

/** True until the survey has been completed or skipped. Accounts from before the survey existed need it too. */
export const needsOnboarding = (user: { interests?: InterestState } | null | undefined) => !!user && !user.interests?.completedAt && !user.interests?.skippedAt;

/** Where to go after the survey: a local path only (never another site, never the survey itself). */
export function safeNext(value: unknown): string {
  const next = typeof value === 'string' ? value.trim() : '';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /^\/onboarding(?:[/?#]|$)/.test(next)) return '/';
  return next.slice(0, 500);
}

const dropSuggestions = (userId: string) => invalidateCacheKeys([`rec:${userId}`]);

export async function saveInterests(userId: string, input: { topics: string[]; keywords: string[] }) {
  await User.updateOne({ _id: userId }, { $set: { 'interests.topics': input.topics, 'interests.keywords': input.keywords, 'interests.completedAt': new Date(), 'interests.skippedAt': null } });
  await dropSuggestions(userId);
  return { topics: input.topics, keywords: input.keywords };
}

/** Lets the person in without answering. Someone who already answered keeps their interests. */
export async function skipOnboarding(userId: string) {
  await User.updateOne({ _id: userId, 'interests.completedAt': null }, { $set: { 'interests.skippedAt': new Date() } });
}
