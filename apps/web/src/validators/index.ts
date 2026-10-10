import { z } from 'zod';
import { AUDIENCE_FIELDS, AUDIENCES, GENDERS, GROUP_TYPES, INTRO_ITEMS, PRONOUNS, REACTION_TYPES, RELATIONSHIPS, SOCIAL_PLATFORMS, STORY_BACKGROUNDS, STORY_REACTIONS } from '../models/index.js';
import { ACTIVITIES, FEELINGS } from '../shared/feelings.js';

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
// HTML forms post flat keys; "audience.location" style names become nested objects.
const nestDotted = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    const [head, tail] = key.split('.', 2) as [string, string | undefined];
    if (tail) out[head] = { ...(typeof out[head] === 'object' ? out[head] : {}), [tail]: item };
    else out[key] = item;
  }
  return out;
};
const flag = z.preprocess((value) => value === true || value === 'true' || value === 'on' || value === '1', z.boolean());
const optionalInt = (min: number, max: number) => z.preprocess((value) => value === '' || value === null || value === undefined ? null : Number(value), z.number().int().min(min).max(max).nullable());
const tagList = (max: number, length: number) => z.preprocess(
  (value) => typeof value === 'string' ? value.split(',') : value,
  z.array(z.string().trim().max(length)).transform((items) => [...new Set(items.filter(Boolean))]).pipe(z.array(z.string()).max(max, `Add up to ${max} items.`))
);
const audience = z.enum(AUDIENCES);
const optionalDate = z.preprocess((value) => value === '' || value === null || value === undefined ? null : value, z.coerce.date().nullable());
export const aboutDetailsSchema = z.object({
  hometown: z.string().trim().max(80),
  relationship: z.enum([...RELATIONSHIPS, '']),
  birthDay: optionalInt(1, 31),
  birthMonth: optionalInt(1, 12),
  birthYear: optionalInt(1900, new Date().getFullYear()),
  gender: z.enum([...GENDERS, '']),
  pronouns: z.enum([...PRONOUNS, '']),
  languages: tagList(10, 40),
  hobbies: tagList(20, 40),
  phone: z.string().trim().max(30).regex(/^[+0-9 ().-]*$/, 'Enter a valid phone number.'),
  publicEmail: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.').max(254)]),
  otherNames: z.string().trim().max(60),
  about: z.string().trim().max(1000),
  quotes: z.string().trim().max(500),
  intro: z.object(Object.fromEntries(INTRO_ITEMS.map((item) => [item, flag])) as Record<(typeof INTRO_ITEMS)[number], typeof flag>).partial(),
  audience: z.object(Object.fromEntries(AUDIENCE_FIELDS.map((field) => [field, audience])) as Record<(typeof AUDIENCE_FIELDS)[number], typeof audience>).partial()
}).partial();
export const profileDetailsSchema = z.preprocess(nestDotted, profileSchema.partial().merge(aboutDetailsSchema).superRefine((value, ctx) => {
  if (value.birthDay && value.birthMonth && new Date(2000, value.birthMonth - 1, value.birthDay).getMonth() !== value.birthMonth - 1) ctx.addIssue({ code: 'custom', path: ['birthDay'], message: 'Choose a valid birthday.' });
}));
export const profileListItemSchemas = {
  work: z.object({ company: z.string().trim().min(1, 'Enter a company.').max(100), position: z.string().trim().max(100).default(''), city: z.string().trim().max(80).default(''), description: z.string().trim().max(300).default(''), startDate: optionalDate.default(null), endDate: optionalDate.default(null), current: flag.default(false) })
    .refine((item) => !item.startDate || !item.endDate || item.current || item.startDate <= item.endDate, { path: ['endDate'], message: 'End date must be after the start date.' }),
  education: z.object({ school: z.string().trim().min(1, 'Enter a school.').max(120), level: z.enum(['college', 'high_school']).default('college'), concentration: z.string().trim().max(100).default(''), degree: z.string().trim().max(100).default(''), startYear: optionalInt(1900, 2100).default(null), endYear: optionalInt(1900, 2100).default(null), graduated: flag.default(false) })
    .refine((item) => !item.startYear || !item.endYear || item.startYear <= item.endYear, { path: ['endYear'], message: 'End year must be after the start year.' }),
  links: z.object({ platform: z.enum(SOCIAL_PLATFORMS).default('website'), url: z.string().trim().url('Enter a full link starting with https://').max(200).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Links must use HTTP or HTTPS') })
} as const;
export type ProfileList = keyof typeof profileListItemSchemas;
export const searchRecordSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('query'), query: z.string().trim().min(2).max(80) }),
  z.object({ kind: z.enum(['user', 'group']), id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id.') })
]);
export const profilePhotoSchema = z.object({ kind: z.enum(['avatar', 'cover']), url: z.string().max(500).optional(), remove: z.preprocess((value) => value === true || value === 'true', z.boolean()).default(false) });
// Multipart posts send structured fields as JSON strings.
const jsonField = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((value) => {
  if (value === undefined || value === '' || value === 'null') return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}, schema.nullable().default(null));
export const postFeelingSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('feeling'), key: z.string().refine((key) => FEELINGS.some((item) => item.key === key), 'Unknown feeling') }),
  z.object({ type: z.literal('activity'), key: z.string().refine((key) => ACTIVITIES.some((item) => item.key === key), 'Unknown activity'), text: z.string().trim().min(1).max(80) })
]);
export const postPlaceSchema = z.object({ id: z.string().max(60).default(''), name: z.string().trim().min(1).max(120), address: z.string().trim().max(200).default(''), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
export const postSchema = z.object({ content: z.string().trim().max(5000).default(''), visibility: z.enum(['public', 'followers', 'private']).default('public'), groupId: z.string().optional(), feeling: jsonField(postFeelingSchema), place: jsonField(postPlaceSchema) });
const mediaSlot = z.union([z.object({ id: z.string().min(1) }), z.object({ upload: z.number().int().min(0) })]);
// Like jsonField, but a missing field stays undefined ("leave as is") while "" or "null" means "remove".
const optionalJsonField = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === '' || value === 'null' || value === null) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}, schema.nullable().optional());
export const postEditSchema = z.object({ content: z.string().trim().max(5000).default(''), visibility: z.enum(['public', 'followers', 'private']).optional(), layout: jsonField(z.array(mediaSlot)), feeling: optionalJsonField(postFeelingSchema), place: optionalJsonField(postPlaceSchema) });
export const photoDeleteSchema = z.object({ url: z.string().min(1).max(500) });
export const placeSearchSchema = z.object({ q: z.string().trim().min(2).max(100), lat: z.coerce.number().min(-90).max(90).optional(), lon: z.coerce.number().min(-180).max(180).optional() });
export const placeNearbySchema = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });
export const reactionSchema = z.object({ type: z.enum(REACTION_TYPES) });
export const commentSchema = z.object({ content: z.string().trim().min(1).max(1500), parentId: z.string().optional() });
export const commentEditSchema = z.object({ content: z.string().trim().min(1, 'Write something before saving.').max(1500) });
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
export const friendActionSchema = z.object({ action: z.enum(['request', 'cancel', 'accept', 'decline', 'unfriend']) });
export const breakSchema = z.object({ seeLess: z.boolean(), restrictPosts: z.boolean() });
export const blockActionSchema = z.object({ blocked: z.boolean() });
export const conversationSchema = z.object({ memberId: z.string().min(1) });
export const messageSchema = z.object({ content: z.string().trim().min(1).max(3000) });

export const storySchema = z.object({ text: z.string().trim().max(250).default(''), background: z.enum(STORY_BACKGROUNDS).default('ocean'), audience: z.enum(['public', 'followers']).optional() });
export const storyReactionSchema = z.object({ type: z.enum(STORY_REACTIONS) });
export const storyReplySchema = z.object({ content: z.string().trim().min(1).max(1000) });
export const storySettingsSchema = z.object({ audience: z.enum(['public', 'followers']) });
