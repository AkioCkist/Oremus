import mongoose, { type InferSchemaType, type Model } from 'mongoose';
import { STORY_ALIGNS, STORY_ANIMATIONS, STORY_BACKGROUNDS, STORY_EFFECTS, STORY_FONTS, STORY_SIZE_RANGE } from '../shared/story-style.js';

const { Schema, model, models } = mongoose;

export const REACTION_TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry'] as const;
export const STORY_REACTIONS = ['love', 'haha', 'angry', 'sad', 'like'] as const;
export { STORY_BACKGROUNDS };
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
export const GROUP_TYPES = ['general', 'social', 'learning', 'hobbies', 'buy_sell', 'gaming', 'jobs', 'parenting', 'work'] as const;

const options = { timestamps: true, versionKey: false } as const;
const objectId = Schema.Types.ObjectId;

export const AUDIENCES = ['public', 'friends', 'only_me'] as const;
export const RELATIONSHIPS = ['single', 'in_relationship', 'engaged', 'married', 'civil_union', 'domestic_partnership', 'open_relationship', 'complicated', 'separated', 'divorced', 'widowed'] as const;
export const GENDERS = ['male', 'female', 'nonbinary', 'other'] as const;
export const PRONOUNS = ['he/him', 'she/her', 'they/them'] as const;
export const SOCIAL_PLATFORMS = ['website', 'facebook', 'instagram', 'x', 'threads', 'tiktok', 'youtube', 'linkedin', 'github', 'discord', 'other'] as const;
/** Details that can appear in the profile Intro card; each can be hidden independently. */
export const INTRO_ITEMS = ['work', 'education', 'location', 'hometown', 'relationship', 'birthday', 'joined', 'followers', 'links', 'hobbies'] as const;
/** Fields with their own audience, like Facebook's per-item privacy selector. */
export const AUDIENCE_FIELDS = ['work', 'education', 'location', 'hometown', 'birthday', 'birthYear', 'relationship', 'gender', 'pronouns', 'languages', 'contact', 'links'] as const;

const workSchema = new Schema({
  company: { type: String, required: true, maxlength: 100 },
  position: { type: String, maxlength: 100, default: '' },
  city: { type: String, maxlength: 80, default: '' },
  description: { type: String, maxlength: 300, default: '' },
  startDate: Date,
  endDate: Date,
  current: { type: Boolean, default: false }
});
const educationSchema = new Schema({
  school: { type: String, required: true, maxlength: 120 },
  level: { type: String, enum: ['college', 'high_school'], default: 'college' },
  concentration: { type: String, maxlength: 100, default: '' },
  degree: { type: String, maxlength: 100, default: '' },
  startYear: Number,
  endYear: Number,
  graduated: { type: Boolean, default: true }
});
const linkSchema = new Schema({
  platform: { type: String, enum: SOCIAL_PLATFORMS, default: 'website' },
  url: { type: String, required: true, maxlength: 200 }
});
const audienceSchema = new Schema(Object.fromEntries(AUDIENCE_FIELDS.map((field) => [field, {
  type: String, enum: AUDIENCES, default: ['birthYear', 'contact'].includes(field) ? 'only_me' : 'public'
}])), { _id: false });

const profileSchema = new Schema({
  bio: { type: String, maxlength: 240, default: '' },
  location: { type: String, maxlength: 80, default: '' },
  website: { type: String, maxlength: 200, default: '' },
  avatarUrl: { type: String, default: '' },
  coverUrl: { type: String, default: '' },
  privacy: { type: String, enum: ['public', 'followers'], default: 'public' },
  // Previously used photos, newest first, for the "Profile pictures" / "Cover photos" pickers.
  avatarHistory: { type: [String], default: [] },
  coverHistory: { type: [String], default: [] },
  storyAudience: { type: String, enum: ['public', 'followers'], default: 'followers' },
  // About details (Facebook-style "About" sections).
  hometown: { type: String, maxlength: 80, default: '' },
  work: { type: [workSchema], default: [] },
  education: { type: [educationSchema], default: [] },
  links: { type: [linkSchema], default: [] },
  relationship: { type: String, enum: [...RELATIONSHIPS, ''], default: '' },
  birthDay: { type: Number, min: 1, max: 31 },
  birthMonth: { type: Number, min: 1, max: 12 },
  birthYear: { type: Number, min: 1900, max: 2100 },
  gender: { type: String, enum: [...GENDERS, ''], default: '' },
  pronouns: { type: String, enum: [...PRONOUNS, ''], default: '' },
  languages: { type: [String], default: [] },
  phone: { type: String, maxlength: 30, default: '' },
  publicEmail: { type: String, maxlength: 254, default: '' },
  otherNames: { type: String, maxlength: 60, default: '' },
  about: { type: String, maxlength: 1000, default: '' },
  quotes: { type: String, maxlength: 500, default: '' },
  hobbies: { type: [String], default: [] },
  introHidden: { type: [String], enum: INTRO_ITEMS, default: [] },
  audience: { type: audienceSchema, default: () => ({}) }
}, { _id: false });

/**
 * Interests from the onboarding survey (topic keys from src/shared/interests.ts plus free sub-interests).
 * Until the survey is completed or skipped, signed-in pages redirect to /onboarding.
 */
const interestsSchema = new Schema({
  topics: { type: [{ type: String, maxlength: 30 }], default: [] },
  keywords: { type: [{ type: String, maxlength: 40 }], default: [] },
  completedAt: { type: Date, default: null },
  skippedAt: { type: Date, default: null }
}, { _id: false });

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 24 },
  displayName: { type: String, required: true, trim: true, maxlength: 60 },
  passwordHash: { type: String, required: true, select: false },
  profile: { type: profileSchema, default: () => ({}) },
  interests: { type: interestsSchema, default: () => ({}) },
  passwordResetHash: { type: String, select: false },
  passwordResetExpiresAt: { type: Date, select: false },
  lastSeenAt: Date,
  deletedAt: { type: Date, default: null }
}, options);
userSchema.index({ displayName: 'text', username: 'text' });

const followSchema = new Schema({
  followerId: { type: objectId, ref: 'User', required: true },
  followingId: { type: objectId, ref: 'User', required: true }
}, options);
followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
followSchema.index({ followingId: 1, followerId: 1 });

// Store each unordered pair once. userAId/userBId are always sorted by id in the
// friendship service, while requesterId preserves the direction of a pending request.
const friendshipSchema = new Schema({
  userAId: { type: objectId, ref: 'User', required: true },
  userBId: { type: objectId, ref: 'User', required: true },
  requesterId: { type: objectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
  acceptedAt: { type: Date, default: null }
}, options);
friendshipSchema.index({ userAId: 1, userBId: 1 }, { unique: true });
friendshipSchema.index({ userAId: 1, status: 1, acceptedAt: -1 });
friendshipSchema.index({ userBId: 1, status: 1, acceptedAt: -1 });

const blockSchema = new Schema({
  blockerId: { type: objectId, ref: 'User', required: true },
  blockedId: { type: objectId, ref: 'User', required: true }
}, options);
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
blockSchema.index({ blockedId: 1, blockerId: 1 });

const socialPreferenceSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true },
  targetId: { type: objectId, ref: 'User', required: true },
  seeLess: { type: Boolean, default: false },
  restrictPosts: { type: Boolean, default: false }
}, options);
socialPreferenceSchema.index({ userId: 1, targetId: 1 }, { unique: true });
socialPreferenceSchema.index({ targetId: 1, restrictPosts: 1 });

const postMediaSchema = new Schema({
  url: { type: String, required: true },
  mimeType: { type: String, required: true },
  alt: { type: String, maxlength: 160, default: '' },
  // Videos are transcoded by the media worker; until then the original upload is served.
  status: { type: String, enum: ['processing', 'ready', 'failed'], default: 'ready' },
  poster: { type: String, default: '' }
}, { _id: true });

const postSchema = new Schema({
  seedKey: { type: String, unique: true, sparse: true, select: false },
  authorId: { type: objectId, ref: 'User', required: true, index: true },
  groupId: { type: objectId, ref: 'Group', default: null, index: true },
  // Facebook-style share: this post re-shares another one (always the original, never a share of a share).
  sharedPostId: { type: objectId, ref: 'Post', default: null },
  content: { type: String, maxlength: 5000, default: '' },
  media: { type: [postMediaSchema], default: [] },
  visibility: { type: String, enum: ['public', 'followers', 'private'], default: 'public' },
  feeling: { type: new Schema({ type: { type: String, enum: ['feeling', 'activity'], required: true }, key: { type: String, required: true }, text: { type: String, maxlength: 80, default: '' } }, { _id: false }), default: null },
  place: { type: new Schema({ id: String, name: { type: String, required: true, maxlength: 120 }, address: { type: String, maxlength: 200, default: '' }, lat: Number, lon: Number }, { _id: false }), default: null },
  // Group posts wait for admin approval when the group turns on post approval.
  groupStatus: { type: String, enum: ['approved', 'pending', 'declined'], default: 'approved' },
  reactionCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  shareCount: { type: Number, default: 0 },
  editedAt: Date,
  deletedAt: { type: Date, default: null, index: true }
}, options);
postSchema.index({ authorId: 1, groupId: 1, deletedAt: 1, createdAt: -1 });
postSchema.index({ groupId: 1, deletedAt: 1, groupStatus: 1, createdAt: -1 });
postSchema.index({ content: 'text' });

const reactionSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true },
  postId: { type: objectId, ref: 'Post', required: true },
  type: { type: String, enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry'], required: true }
}, options);
reactionSchema.index({ userId: 1, postId: 1 }, { unique: true });

const commentSchema = new Schema({
  postId: { type: objectId, ref: 'Post', required: true, index: true },
  authorId: { type: objectId, ref: 'User', required: true },
  parentId: { type: objectId, ref: 'Comment', default: null },
  content: { type: String, required: true, maxlength: 1500 },
  editedAt: Date,
  deletedAt: { type: Date, default: null }
}, options);
commentSchema.index({ postId: 1, createdAt: 1 });
commentSchema.index({ parentId: 1, deletedAt: 1 });

const groupSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  slug: { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, maxlength: 500, default: '' },
  coverUrl: { type: String, default: '' },
  privacy: { type: String, enum: ['public', 'private'], default: 'public' },
  // Facebook-style: private groups can be hidden from search and the directory.
  visibility: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
  groupType: { type: String, enum: GROUP_TYPES, default: 'general' },
  location: { type: String, maxlength: 80, default: '' },
  tags: { type: [{ type: String, maxlength: 30 }], default: [] },
  rules: { type: [new Schema({ title: { type: String, required: true, maxlength: 80 }, details: { type: String, maxlength: 500, default: '' } }, { _id: false })], default: [] },
  questions: { type: [{ type: String, maxlength: 250 }], default: [] },
  settings: {
    type: new Schema({
      whoCanPost: { type: String, enum: ['anyone', 'admins'], default: 'anyone' },
      postApproval: { type: Boolean, default: false },
      whoCanApprove: { type: String, enum: ['admins', 'anyone'], default: 'admins' }
    }, { _id: false }),
    default: () => ({})
  },
  ownerId: { type: objectId, ref: 'User', required: true },
  memberCount: { type: Number, default: 1 }
}, options);
groupSchema.index({ name: 'text', description: 'text' });

const groupMemberSchema = new Schema({
  groupId: { type: objectId, ref: 'Group', required: true },
  userId: { type: objectId, ref: 'User', required: true },
  role: { type: String, enum: ['admin', 'moderator', 'member'], default: 'member' }
}, options);
groupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
groupMemberSchema.index({ userId: 1, groupId: 1 });

const groupJoinRequestSchema = new Schema({
  groupId: { type: objectId, ref: 'Group', required: true },
  userId: { type: objectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  answers: { type: [new Schema({ question: String, answer: { type: String, maxlength: 500 } }, { _id: false })], default: [] },
  agreedToRules: { type: Boolean, default: false },
  reviewedBy: { type: objectId, ref: 'User' },
  reviewedAt: Date
}, options);
groupJoinRequestSchema.index({ groupId: 1, userId: 1, status: 1 });
groupJoinRequestSchema.index({ groupId: 1, status: 1, createdAt: 1 });

const groupPostSchema = new Schema({
  groupId: { type: objectId, ref: 'Group', required: true },
  postId: { type: objectId, ref: 'Post', required: true, unique: true },
  authorId: { type: objectId, ref: 'User', required: true }
}, options);
groupPostSchema.index({ groupId: 1, createdAt: -1 });

const groupInviteSchema = new Schema({
  groupId: { type: objectId, ref: 'Group', required: true },
  userId: { type: objectId, ref: 'User', required: true },
  invitedBy: { type: objectId, ref: 'User', required: true },
  // Invites from admins/moderators skip membership approval, as on Facebook.
  byAdmin: { type: Boolean, default: false }
}, options);
groupInviteSchema.index({ groupId: 1, userId: 1 }, { unique: true });

const conversationSchema = new Schema({
  seedKey: { type: String, unique: true, sparse: true, select: false },
  memberIds: [{ type: objectId, ref: 'User', required: true }],
  lastMessageAt: { type: Date, default: Date.now }
}, options);
conversationSchema.index({ memberIds: 1, lastMessageAt: -1 });

const messageSchema = new Schema({
  conversationId: { type: objectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: objectId, ref: 'User', required: true },
  content: { type: String, required: true, maxlength: 3000 },
  readBy: [{ type: objectId, ref: 'User' }],
  deletedAt: { type: Date, default: null }
}, options);
messageSchema.index({ conversationId: 1, createdAt: -1 });

const notificationSchema = new Schema({
  recipientId: { type: objectId, ref: 'User', required: true, index: true },
  actorId: { type: objectId, ref: 'User', required: true },
  type: { type: String, enum: ['reaction', 'comment', 'follow', 'friend_request', 'friend_accept', 'group_request', 'group_invite', 'group_post', 'message', 'story_reaction', 'share'], required: true },
  entityType: { type: String, required: true },
  entityId: { type: objectId, required: true },
  text: { type: String, required: true, maxlength: 180 },
  readAt: { type: Date, default: null }
}, options);
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });

const storySchema = new Schema({
  seedKey: { type: String, unique: true, sparse: true, select: false },
  authorId: { type: objectId, ref: 'User', required: true },
  media: { type: new Schema({ url: { type: String, required: true }, mimeType: { type: String, required: true } }, { _id: false }), default: null },
  text: { type: String, maxlength: 250, default: '' },
  background: { type: String, enum: STORY_BACKGROUNDS, default: 'ocean' },
  // Text styling from the composer; null on stories created before styling existed (rendered as plain text / caption).
  style: { type: new Schema({
    font: { type: String, enum: STORY_FONTS, default: 'classic' },
    color: { type: String, match: /^#[0-9a-f]{6}$/, default: '#ffffff' },
    align: { type: String, enum: STORY_ALIGNS, default: 'center' },
    effect: { type: String, enum: STORY_EFFECTS, default: 'shadow' },
    animation: { type: String, enum: STORY_ANIMATIONS, default: 'none' },
    size: { type: Number, min: STORY_SIZE_RANGE.min, max: STORY_SIZE_RANGE.max, default: 1 },
    x: { type: Number, min: 0, max: 100, default: 50 },
    y: { type: Number, min: 0, max: 100, default: 50 }
  }, { _id: false }), default: null },
  audience: { type: String, enum: ['public', 'followers'], default: 'followers' },
  viewCount: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  deletedAt: { type: Date, default: null }
}, options);
storySchema.index({ authorId: 1, expiresAt: -1 });
storySchema.index({ expiresAt: 1, deletedAt: 1 });

// One row per viewer: records the view and, optionally, the viewer's reaction.
const storyViewSchema = new Schema({
  storyId: { type: objectId, ref: 'Story', required: true },
  viewerId: { type: objectId, ref: 'User', required: true },
  reaction: { type: String, enum: [...STORY_REACTIONS, null], default: null }
}, options);
storyViewSchema.index({ storyId: 1, viewerId: 1 }, { unique: true });
storyViewSchema.index({ viewerId: 1, storyId: 1 });

const refreshTokenSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  family: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  revokedAt: { type: Date, default: null },
  replacedByHash: String,
  userAgent: String,
  ip: String
}, options);

const auditLogSchema = new Schema({
  actorId: { type: objectId, ref: 'User', default: null },
  action: { type: String, required: true, index: true },
  targetType: String,
  targetId: objectId,
  metadata: { type: Schema.Types.Mixed, default: {} },
  ip: String
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
auditLogSchema.index({ createdAt: -1 });

export type IUser = InferSchemaType<typeof userSchema>;
export const User: Model<any> = models.User || model('User', userSchema);
export const Follow: Model<any> = models.Follow || model('Follow', followSchema);
export const Friendship: Model<any> = models.Friendship || model('Friendship', friendshipSchema);
export const Block: Model<any> = models.Block || model('Block', blockSchema);
export const SocialPreference: Model<any> = models.SocialPreference || model('SocialPreference', socialPreferenceSchema);
// Facebook-style "Recent searches": one row per keyword / profile / group the user searched or opened.
export const SEARCH_HISTORY_KINDS = ['query', 'user', 'group'] as const;
const searchHistorySchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true },
  kind: { type: String, enum: SEARCH_HISTORY_KINDS, required: true },
  // "q:<normalized query>" or "<kind>:<id>" so repeating a search just bumps it to the top.
  key: { type: String, required: true, maxlength: 120 },
  query: { type: String, maxlength: 80, default: '' },
  refId: { type: objectId, default: null }
}, options);
searchHistorySchema.index({ userId: 1, key: 1 }, { unique: true });
searchHistorySchema.index({ userId: 1, updatedAt: -1 });

// How often each keyword is searched across Oremus; feeds typeahead completions.
const searchTermSchema = new Schema({
  term: { type: String, required: true, unique: true, maxlength: 80 },
  count: { type: Number, default: 0 }
}, options);
searchTermSchema.index({ count: -1 });

/**
 * Behaviour signals for the recommender (see src/recommender): searches, clicks/opens, reading time,
 * reactions, comments, follows, joins and story views. Each row keeps the target's keywords as they were
 * when the signal happened, so the interest profile never has to re-read (or leak) content later.
 */
export const SIGNAL_TYPES = ['search', 'open', 'click', 'dwell', 'react', 'comment', 'share', 'follow', 'join', 'story_view'] as const;
export const SIGNAL_TARGETS = ['query', 'post', 'user', 'group', 'story'] as const;
export const SIGNAL_RETENTION_DAYS = 120;
const interactionSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true },
  type: { type: String, enum: SIGNAL_TYPES, required: true },
  targetType: { type: String, enum: SIGNAL_TARGETS, required: true },
  targetId: { type: objectId, default: null },
  // Who made the target (post/story author, or the profile itself) and its group, for affinity.
  authorId: { type: objectId, default: null },
  groupId: { type: objectId, default: null },
  // Search text, or a short title used to explain recommendations ("Because you searched …").
  label: { type: String, maxlength: 120, default: '' },
  durationMs: { type: Number, min: 0, default: 0 },
  features: { type: [new Schema({ t: { type: String, required: true, maxlength: 60 }, w: { type: Number, required: true }, s: { type: String, maxlength: 60 } }, { _id: false })], default: [] }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
interactionSchema.index({ userId: 1, createdAt: -1 });
interactionSchema.index({ createdAt: 1 }, { expireAfterSeconds: SIGNAL_RETENTION_DAYS * 24 * 60 * 60 });

export const Post: Model<any> = models.Post || model('Post', postSchema);
export const Reaction: Model<any> = models.Reaction || model('Reaction', reactionSchema);
export const Comment: Model<any> = models.Comment || model('Comment', commentSchema);
export const Group: Model<any> = models.Group || model('Group', groupSchema);
export const GroupMember: Model<any> = models.GroupMember || model('GroupMember', groupMemberSchema);
export const GroupJoinRequest: Model<any> = models.GroupJoinRequest || model('GroupJoinRequest', groupJoinRequestSchema);
export const GroupInvite: Model<any> = models.GroupInvite || model('GroupInvite', groupInviteSchema);
export const GroupPost: Model<any> = models.GroupPost || model('GroupPost', groupPostSchema);
export const Conversation: Model<any> = models.Conversation || model('Conversation', conversationSchema);
export const Message: Model<any> = models.Message || model('Message', messageSchema);
export const Notification: Model<any> = models.Notification || model('Notification', notificationSchema);
export const Story: Model<any> = models.Story || model('Story', storySchema);
export const StoryView: Model<any> = models.StoryView || model('StoryView', storyViewSchema);
export const RefreshToken: Model<any> = models.RefreshToken || model('RefreshToken', refreshTokenSchema);
export const AuditLog: Model<any> = models.AuditLog || model('AuditLog', auditLogSchema);
export const SearchHistory: Model<any> = models.SearchHistory || model('SearchHistory', searchHistorySchema);
export const SearchTerm: Model<any> = models.SearchTerm || model('SearchTerm', searchTermSchema);
export const Interaction: Model<any> = models.Interaction || model('Interaction', interactionSchema);
