import { z } from 'zod';
import { GROUP_TYPES, REACTION_TYPES, STORY_BACKGROUNDS, STORY_REACTIONS } from '../models/index.js';

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'Username must contain 3–24 letters, numbers, or underscores.');
const password = z.string({ required_error: 'Enter a password.' })
  .min(10, 'Password must be at least 10 characters.')
  .max(128, 'Password must be no more than 128 characters.')
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/[0-9]/, 'Password must include a number.');

export const registerSchema = z.object({
  email: z.string({ required_error: 'Enter your email address.' }).email('Enter a valid email address.').max(254, 'Email address is too long.').toLowerCase(),
  username,
  displayName: z.string({ required_error: 'Enter your full name.' }).trim().min(2, 'Full name must be at least 2 characters.').max(60, 'Full name must be no more than 60 characters.'),
  password
});
const rememberLogin = z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean()).default(false);
export const loginSchema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1).max(128), remember: rememberLogin });
export const resetRequestSchema = z.object({ email: z.string().email().toLowerCase() });
export const resetConfirmSchema = z.object({ token: z.string().min(20), password });
const website = z.union([z.literal(''), z.string().url().max(200).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Website must use HTTP or HTTPS')]);
export const profileSchema = z.object({ displayName: z.string().trim().min(2).max(60), username, bio: z.string().trim().max(240).default(''), location: z.string().trim().max(80).default(''), website: website.default(''), privacy: z.enum(['public', 'followers']).default('public') });
export const profileDetailsSchema = profileSchema.partial();
export const profilePhotoSchema = z.object({ kind: z.enum(['avatar', 'cover']), url: z.string().max(500).optional(), remove: z.preprocess((value) => value === true || value === 'true', z.boolean()).default(false) });
export const postSchema = z.object({ content: z.string().trim().max(5000).default(''), visibility: z.enum(['public', 'followers', 'private']).default('public'), groupId: z.string().optional() });
export const postEditSchema = z.object({ content: z.string().trim().min(1).max(5000), visibility: z.enum(['public', 'followers', 'private']).optional() });
export const reactionSchema = z.object({ type: z.enum(REACTION_TYPES) });
export const commentSchema = z.object({ content: z.string().trim().min(1).max(1500), parentId: z.string().optional() });
const groupRule = z.object({ title: z.string().trim().min(1).max(80), details: z.string().trim().max(500).default('') });
const groupSettings = z.object({ whoCanPost: z.enum(['anyone', 'admins']).default('anyone'), postApproval: z.boolean().default(false), whoCanApprove: z.enum(['admins', 'anyone']).default('admins') });
export const groupSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).default(''),
  privacy: z.enum(['public', 'private']).default('public'),
  visibility: z.enum(['visible', 'hidden']).default('visible'),
  groupType: z.enum(GROUP_TYPES).default('general'),
  location: z.string().trim().max(80).default(''),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(5).default([]),
  rules: z.array(groupRule).max(10).default([]),
  questions: z.array(z.string().trim().min(1).max(250)).max(3).default([]),
  settings: groupSettings.default({}),
  coverUrl: z.string().max(500).optional(),
  removeCover: z.boolean().default(false),
  invite: z.array(z.string().min(1)).max(50).default([])
}).transform((group) => ({ ...group, tags: [...new Set(group.tags)], visibility: group.privacy === 'public' ? 'visible' as const : group.visibility }));
export const groupJoinSchema = z.object({ answers: z.array(z.string().trim().max(500)).max(3).default([]), agreeRules: z.boolean().default(false) });
export const groupInviteSchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(50) });
export const decisionSchema = z.object({ decision: z.enum(['approve', 'reject']) });
export const conversationSchema = z.object({ memberId: z.string().min(1) });
export const messageSchema = z.object({ content: z.string().trim().min(1).max(3000) });

export const storySchema = z.object({ text: z.string().trim().max(250).default(''), background: z.enum(STORY_BACKGROUNDS).default('ocean'), audience: z.enum(['public', 'followers']).optional() });
export const storyReactionSchema = z.object({ type: z.enum(STORY_REACTIONS) });
export const storyReplySchema = z.object({ content: z.string().trim().min(1).max(1000) });
export const storySettingsSchema = z.object({ audience: z.enum(['public', 'followers']) });
