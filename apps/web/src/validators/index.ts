import { z } from 'zod';
import { REACTION_TYPES } from '../models/index.js';

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'Use 3–24 letters, numbers, or underscores');
const password = z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);

export const registerSchema = z.object({ email: z.string().email().max(254).toLowerCase(), username, displayName: z.string().trim().min(2).max(60), password });
export const loginSchema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1).max(128) });
export const resetRequestSchema = z.object({ email: z.string().email().toLowerCase() });
export const resetConfirmSchema = z.object({ token: z.string().min(20), password });
const website = z.union([z.literal(''), z.string().url().max(200).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Website must use HTTP or HTTPS')]);
export const profileSchema = z.object({ displayName: z.string().trim().min(2).max(60), username, bio: z.string().trim().max(240).default(''), location: z.string().trim().max(80).default(''), website: website.default(''), privacy: z.enum(['public', 'followers']).default('public') });
export const postSchema = z.object({ content: z.string().trim().max(5000).default(''), visibility: z.enum(['public', 'followers', 'private']).default('public'), groupId: z.string().optional() });
export const postEditSchema = z.object({ content: z.string().trim().min(1).max(5000), visibility: z.enum(['public', 'followers', 'private']).optional() });
export const reactionSchema = z.object({ type: z.enum(REACTION_TYPES) });
export const commentSchema = z.object({ content: z.string().trim().min(1).max(1500), parentId: z.string().optional() });
export const groupSchema = z.object({ name: z.string().trim().min(3).max(80), description: z.string().trim().max(500).default(''), privacy: z.enum(['public', 'private']).default('public') });
export const decisionSchema = z.object({ decision: z.enum(['approve', 'reject']) });
export const conversationSchema = z.object({ memberId: z.string().min(1) });
export const messageSchema = z.object({ content: z.string().trim().min(1).max(3000) });

