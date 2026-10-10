import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { Schema, model, models } = mongoose;

export const REACTION_TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry'] as const;
export const STORY_REACTIONS = ['love', 'haha', 'angry', 'sad', 'like'] as const;
export const STORY_BACKGROUNDS = ['sunset', 'ocean', 'forest', 'night', 'candy', 'sun'] as const;
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
export const GROUP_TYPES = ['general', 'social', 'learning', 'hobbies', 'buy_sell', 'gaming', 'jobs', 'parenting', 'work'] as const;

const options = { timestamps: true, versionKey: false } as const;
const objectId = Schema.Types.ObjectId;

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
  storyAudience: { type: String, enum: ['public', 'followers'], default: 'followers' }
}, { _id: false });

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 24 },
  displayName: { type: String, required: true, trim: true, maxlength: 60 },
  passwordHash: { type: String, required: true, select: false },
  profile: { type: profileSchema, default: () => ({}) },
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

const postMediaSchema = new Schema({
  url: { type: String, required: true },
  mimeType: { type: String, required: true },
  alt: { type: String, maxlength: 160, default: '' }
}, { _id: true });

const postSchema = new Schema({
  seedKey: { type: String, unique: true, sparse: true, select: false },
  authorId: { type: objectId, ref: 'User', required: true, index: true },
  groupId: { type: objectId, ref: 'Group', default: null, index: true },
  content: { type: String, maxlength: 5000, default: '' },
  media: { type: [postMediaSchema], default: [] },
  visibility: { type: String, enum: ['public', 'followers', 'private'], default: 'public' },
  feeling: { type: new Schema({ type: { type: String, enum: ['feeling', 'activity'], required: true }, key: { type: String, required: true }, text: { type: String, maxlength: 80, default: '' } }, { _id: false }), default: null },
  place: { type: new Schema({ id: String, name: { type: String, required: true, maxlength: 120 }, address: { type: String, maxlength: 200, default: '' }, lat: Number, lon: Number }, { _id: false }), default: null },
  // Group posts wait for admin approval when the group turns on post approval.
  groupStatus: { type: String, enum: ['approved', 'pending', 'declined'], default: 'approved' },
  reactionCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  editedAt: Date,
  deletedAt: { type: Date, default: null, index: true }
}, options);
postSchema.index({ createdAt: -1, authorId: 1 });
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
  type: { type: String, enum: ['reaction', 'comment', 'follow', 'group_request', 'group_invite', 'group_post', 'message', 'story_reaction'], required: true },
  entityType: { type: String, required: true },
  entityId: { type: objectId, required: true },
  text: { type: String, required: true, maxlength: 180 },
  readAt: { type: Date, default: null }
}, options);
notificationSchema.index({ recipientId: 1, createdAt: -1 });

const storySchema = new Schema({
  seedKey: { type: String, unique: true, sparse: true, select: false },
  authorId: { type: objectId, ref: 'User', required: true },
  media: { type: new Schema({ url: { type: String, required: true }, mimeType: { type: String, required: true } }, { _id: false }), default: null },
  text: { type: String, maxlength: 250, default: '' },
  background: { type: String, enum: STORY_BACKGROUNDS, default: 'ocean' },
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
