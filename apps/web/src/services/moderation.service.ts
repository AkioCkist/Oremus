import { redis } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { addJob, QUEUES } from '../jobs/queues.js';
import { checkRules } from '../moderation/rules.js';
import { quarantineFiles, restoreFiles } from '../moderation/quarantine.js';
import { DISCOVERABLE } from '../moderation/visibility.js';
import { AdCampaign, Comment, Group, Message, ModerationCase, ModerationPolicy, ModerationScan, Post, Report, Story, User } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { suspendUser } from './account.service.js';
import { audit } from './audit.service.js';
import { invalidateSocialCaches } from './cache.service.js';
import { notifySystem } from './notification.service.js';

export type TargetType = 'Post' | 'Comment' | 'Story' | 'User' | 'Group' | 'Message' | 'AdCampaign';
export type Decision = 'approved' | 'limited' | 'removed';
export type Scores = Record<string, number>;

/** Content types that carry a moderationStatus. Profiles and groups only ever go to a person. */
const STATUS_MODELS: Partial<Record<TargetType, any>> = { Post, Comment, Story };

/* ---------- Writing content ---------- */

/** Refuses text with an unambiguous threat before it is stored. Everything else is decided after the write. */
export function assertTextAllowed(...texts: Array<string | null | undefined>): void {
  if (env.MODERATION_MODE === 'off') return;
  for (const text of texts) {
    if (!text) continue;
    const result = checkRules(text);
    if (result.verdict !== 'block') continue;
    // In shadow mode a block is only logged, so turning shadow on can never change what members experience.
    if (env.MODERATION_MODE === 'shadow') { logger.info({ categories: result.categories }, 'Shadow moderation would have refused a write'); continue; }
    throw new AppError(422, "This can't be posted because it looks like a threat or encourages self-harm. If this is a mistake, rephrase and try again.", 'CONTENT_REJECTED');
  }
}

/** Status for new or edited content. Media stays private to its author until scanned; text shows right away. */
export function initialStatus(hasNewMedia: boolean): string {
  if (env.MODERATION_MODE !== 'enforce') return 'approved';
  return hasNewMedia ? 'held' : 'pending';
}

/** Queues a scan. Never fails the write: the sweep in jobs-worker picks up anything left pending. */
export async function requestScan(targetType: TargetType, targetId: unknown): Promise<void> {
  if (env.MODERATION_MODE === 'off') return;
  try { await addJob(QUEUES.moderation, 'scan', { targetType, targetId: String(targetId) }, SCAN_JOB); }
  catch (error) { logger.error({ error, targetType, targetId }, 'Could not queue a moderation scan'); }
}
// The models can take minutes to come up after a restart, so scans wait through that rather than fail.
export const SCAN_JOB = { attempts: 6, backoff: { type: 'exponential', delay: 30_000 } };

/* ---------- Policy ---------- */

/**
 * Starting points from apps/moderation/eval (169 labelled Vietnamese samples) and 300 ordinary profile photos.
 * Auto-removal needs precision >= 0.9 at the block threshold, which only harassment reached:
 * - harassment: precision 1.0 from 0.9 up.
 * - hate: at best 0.33, because the model also calls plain insults hate. It only raises a case.
 * - sexual: scored one ordinary portrait of a woman 0.9989, so a person always decides.
 */
const DEFAULT_POLICY = [
  { category: 'hate', review: 0.6, block: 0.95, autoRemove: false },
  { category: 'harassment', review: 0.6, block: 0.97, autoRemove: true },
  { category: 'sexual', review: 0.6, block: 0.95, autoRemove: false },
  { category: 'violence', review: 0.5, block: 0.95, autoRemove: false },
  { category: 'self_harm', review: 0.5, block: 0.95, autoRemove: false },
  { category: 'spam', review: 0.5, block: 0.98, autoRemove: false }
];

export async function loadPolicy() {
  const rows: any[] = await ModerationPolicy.find().lean();
  if (rows.length) return rows;
  await ModerationPolicy.insertMany(DEFAULT_POLICY, { ordered: false }).catch(() => undefined);
  return DEFAULT_POLICY;
}

type PolicyRow = { category: string; review: number; block: number; autoRemove?: boolean };

/** Applies thresholds to scores. Removal also needs autoRemove: categories where models misread context only go to a person. */
export function decide(scores: Scores, policy: PolicyRow[]): { decision: Decision; categories: string[] } {
  let decision: Decision = 'approved';
  const categories: string[] = [];
  for (const row of policy) {
    const score = scores[row.category] ?? 0;
    if (score < row.review) continue;
    categories.push(row.category);
    if (score >= row.block && row.autoRemove) decision = 'removed';
    else if (decision === 'approved') decision = 'limited';
  }
  return { decision, categories };
}

/* ---------- Targets ---------- */

/** The text and media of a target, used for scanning and for showing the case to a reviewer. */
export async function loadTarget(targetType: TargetType, targetId: string): Promise<{ authorId: string; text: string; mediaUrls: string[]; status: string | null } | null> {
  switch (targetType) {
    case 'Post': {
      const post: any = await Post.findOne({ _id: targetId, deletedAt: null }).select('authorId content media moderationStatus').lean();
      return post && { authorId: String(post.authorId), text: post.content || '', mediaUrls: mediaFiles(post.media), status: post.moderationStatus ?? null };
    }
    case 'Comment': {
      const comment: any = await Comment.findOne({ _id: targetId, deletedAt: null }).select('authorId content moderationStatus').lean();
      return comment && { authorId: String(comment.authorId), text: comment.content, mediaUrls: [], status: comment.moderationStatus ?? null };
    }
    case 'Story': {
      const story: any = await Story.findOne({ _id: targetId, deletedAt: null }).select('authorId text media moderationStatus').lean();
      return story && { authorId: String(story.authorId), text: story.text || '', mediaUrls: story.media ? [story.media.url] : [], status: story.moderationStatus ?? null };
    }
    case 'User': {
      const user: any = await User.findOne({ _id: targetId, deletedAt: null }).select('displayName profile.bio profile.about profile.quotes profile.avatarUrl').lean();
      return user && { authorId: String(user._id), text: [user.displayName, user.profile?.bio, user.profile?.about, user.profile?.quotes].filter(Boolean).join('\n'), mediaUrls: user.profile?.avatarUrl ? [user.profile.avatarUrl] : [], status: null };
    }
    case 'Group': {
      const group: any = await Group.findById(targetId).select('ownerId name description coverUrl').lean();
      return group && { authorId: String(group.ownerId), text: [group.name, group.description].filter(Boolean).join('\n'), mediaUrls: group.coverUrl ? [group.coverUrl] : [], status: null };
    }
    case 'AdCampaign': {
      const campaign: any = await AdCampaign.findById(targetId).select('advertiserId headline body mediaUrl').lean();
      return campaign && { authorId: String(campaign.advertiserId), text: [campaign.headline, campaign.body].filter(Boolean).join('\n'), mediaUrls: campaign.mediaUrl ? [campaign.mediaUrl] : [], status: null };
    }
    case 'Message': {
      const message: any = await Message.findOne({ _id: targetId, deletedAt: null }).select('senderId content').lean();
      return message && { authorId: String(message.senderId), text: message.content, mediaUrls: [], status: null };
    }
  }
}

const mediaFiles = (media: any[] = []) => media.flatMap((item) => [item.url, item.poster].filter(Boolean));

const recountComments = async (postId: unknown) => {
  await Post.updateOne({ _id: postId }, { commentCount: await Comment.countDocuments({ postId, deletedAt: null, ...DISCOVERABLE }) });
};

async function setStatus(targetType: TargetType, targetId: string, status: string, onlyFrom?: string[]): Promise<boolean> {
  const model = STATUS_MODELS[targetType];
  if (!model) return false;
  const result = await model.updateOne({ _id: targetId, ...(onlyFrom ? { moderationStatus: { $in: onlyFrom } } : {}) }, { moderationStatus: status });
  if (!result.modifiedCount) return false;
  if (targetType === 'Comment') {
    const comment: any = await Comment.findById(targetId).select('postId').lean();
    if (comment) await recountComments(comment.postId);
  }
  await invalidateSocialCaches([], { search: true });
  return true;
}

/** Takes content down for good: hides it and moves its files out of public reach. */
async function takeDown(targetType: TargetType, targetId: string): Promise<void> {
  const target = await loadTarget(targetType, targetId);
  if (!target) return;
  if (STATUS_MODELS[targetType]) {
    await setStatus(targetType, targetId, 'removed');
    await quarantineFiles(target.mediaUrls);
  } else if (targetType === 'Message') {
    await Message.updateOne({ _id: targetId }, { deletedAt: new Date() });
  } else if (targetType === 'User') {
    // An account is not removed by a content decision; its public text and picture are cleared.
    await User.updateOne({ _id: targetId }, { 'profile.bio': '', 'profile.about': '', 'profile.quotes': '', 'profile.avatarUrl': '' });
    await quarantineFiles(target.mediaUrls);
  } else if (targetType === 'Group') {
    await Group.updateOne({ _id: targetId }, { visibility: 'hidden' });
  } else if (targetType === 'AdCampaign') {
    await AdCampaign.updateOne({ _id: targetId, status: { $ne: 'ended' } }, { status: 'rejected', rejectionReason: 'Removed after review for breaking the ad rules.' });
    await redis.del('cache:ads:eligible');
  }
}

/** Undoes a take-down. Cleared profile text stays cleared: it is the member's to write again. */
async function restore(targetType: TargetType, targetId: string): Promise<void> {
  if (!STATUS_MODELS[targetType]) return;
  const target = await loadTarget(targetType, targetId);
  if (target) await restoreFiles(target.mediaUrls);
  await setStatus(targetType, targetId, 'approved');
}

/* ---------- Cases ---------- */

type CaseInput = { targetType: TargetType; targetId: string; source: 'ai' | 'rule' | 'report' | 'system'; categories?: string[]; scores?: Scores; models?: string[]; autoAction?: string; priority?: number };

/** One open case per target: new signals pile onto it, so a reviewer sees everything in one place. */
export async function openCase(input: CaseInput) {
  const target = await loadTarget(input.targetType, input.targetId);
  if (!target) return null;
  const filter = { targetType: input.targetType, targetId: input.targetId, status: 'open' };
  const update = {
    $setOnInsert: { source: input.source, authorId: target.authorId, snippet: target.text.slice(0, 1000), mediaUrls: target.mediaUrls.slice(0, 12) },
    $set: { ...(input.scores ? { scores: input.scores } : {}), ...(input.models ? { models: input.models } : {}), ...(input.autoAction ? { autoAction: input.autoAction } : {}) },
    $addToSet: { categories: { $each: input.categories || [] } },
    $inc: { priority: input.priority ?? 1 }
  };
  try {
    return await ModerationCase.findOneAndUpdate(filter, update, { upsert: true, new: true });
  } catch (error: any) {
    // Two signals raced on the unique open-case index: the other one created it, so update that.
    if (error?.code === 11000) return ModerationCase.findOneAndUpdate(filter, { $set: update.$set, $addToSet: update.$addToSet, $inc: update.$inc }, { new: true });
    throw error;
  }
}

const TARGET_NAMES: Record<string, string> = { AdCampaign: 'ad', Post: 'post', Comment: 'comment', Story: 'story', User: 'profile', Group: 'group', Message: 'message' };
const noticeEntity = (targetType: string, targetId: string, authorId: string) => (targetType === 'Post' ? { entityType: 'Post', entityId: targetId } : { entityType: 'User', entityId: authorId });

/** Applies a finished scan. Only touches content still waiting for one, so a reviewer's decision is never overwritten. */
export async function applyScan(targetType: TargetType, targetId: string, result: { decision: Decision; categories: string[]; scores: Scores; models: string[]; source: 'ai' | 'rule' }): Promise<void> {
  const target = await loadTarget(targetType, targetId);
  if (!target) return;
  const hasStatus = !!STATUS_MODELS[targetType];
  if (result.decision === 'approved') {
    if (hasStatus) await setStatus(targetType, targetId, 'approved', ['pending', 'held']);
    return;
  }
  const canRemove = hasStatus && result.decision === 'removed';
  const autoAction = canRemove ? 'removed' : hasStatus ? 'limited' : 'none';
  if (hasStatus && !(await setStatus(targetType, targetId, autoAction, ['pending', 'held']))) return;
  await openCase({ targetType, targetId, source: result.source, categories: result.categories, scores: result.scores, models: result.models, autoAction, priority: canRemove ? 5 : 2 });
  if (canRemove) {
    await quarantineFiles(target.mediaUrls);
    await notifySystem({ recipientId: target.authorId, type: 'moderation', ...noticeEntity(targetType, targetId, target.authorId), text: `removed your ${TARGET_NAMES[targetType]} for breaking the community rules. You can appeal in Settings.` });
  }
}

/** Scans that failed for good: nothing was found, so the content goes live, and a person checks it if media was involved. */
export async function failOpen(targetType: TargetType, targetId: string): Promise<void> {
  const target = await loadTarget(targetType, targetId);
  if (!target) return;
  await setStatus(targetType, targetId, 'approved', ['pending', 'held']);
  if (target.mediaUrls.length) await openCase({ targetType, targetId, source: 'system', categories: ['unscanned'], priority: 1 });
}

export function recordScan(input: { targetType: string; targetId: string; authorId: string; scores: Scores; decision: string; categories: string[]; models: string[]; ruleMatches: string[]; shadow: boolean }) {
  return ModerationScan.create(input);
}

/** Repeat offences step up from a warning to suspensions. A ban is never automatic: staff are told to consider one. */
export async function applyStrike(actorId: string, authorId: string, reason: string): Promise<{ strikes: number; consequence: string }> {
  // Accounts from before roles existed have no role stored, so staff are matched rather than members.
  const user: any = await User.findOneAndUpdate({ _id: authorId, role: { $nin: ['moderator', 'admin'] } }, { $inc: { strikes: 1 } }, { new: true }).select('strikes').lean();
  if (!user) return { strikes: 0, consequence: 'none (staff account)' };
  const days = user.strikes === 2 ? 1 : user.strikes === 3 ? 7 : 0;
  if (days) await suspendUser(actorId, authorId, { until: new Date(Date.now() + days * 86_400_000), reason });
  else await notifySystem({ recipientId: authorId, type: 'moderation', entityType: 'User', entityId: authorId, text: user.strikes === 1 ? 'sent you a warning for breaking the community rules. Repeat violations can lead to a suspension.' : 'recorded another violation on your account.' });
  return { strikes: user.strikes, consequence: days ? `suspended ${days}d` : user.strikes >= 4 ? 'ban recommended' : 'warning' };
}

export async function decideCase(actorId: string, caseId: string, verdict: 'uphold' | 'dismiss', note: string) {
  const status = verdict === 'uphold' ? 'upheld' : 'dismissed';
  const appealOutcome = verdict === 'uphold' ? 'denied' : 'granted';
  const found: any = await ModerationCase.findOneAndUpdate({ _id: caseId, status: 'open' }, { status, decidedBy: actorId, decidedAt: new Date(), decisionNote: note }, { new: false });
  if (!found) throw new AppError(409, 'This case has already been decided.', 'CASE_DECIDED');
  if (found.appeal?.status === 'pending') await ModerationCase.updateOne({ _id: caseId }, { 'appeal.status': appealOutcome, 'appeal.decidedBy': actorId, 'appeal.decidedAt': new Date() });
  const targetId = String(found.targetId), authorId = String(found.authorId);
  let strike = { strikes: 0, consequence: 'none' };
  if (verdict === 'uphold') {
    await takeDown(found.targetType, targetId);
    strike = await applyStrike(actorId, authorId, `Community rules: ${(found.categories || []).join(', ') || 'violation'}`);
    await notifySystem({ recipientId: authorId, type: 'moderation', ...noticeEntity(found.targetType, targetId, authorId), text: `removed your ${TARGET_NAMES[found.targetType] || 'content'} after review.` });
  } else {
    await restore(found.targetType, targetId);
    if (found.autoAction === 'removed') await notifySystem({ recipientId: authorId, type: 'moderation', ...noticeEntity(found.targetType, targetId, authorId), text: `restored your ${TARGET_NAMES[found.targetType] || 'content'} after review.` });
  }
  await Report.updateMany({ caseId }, { status: verdict === 'uphold' ? 'actioned' : 'dismissed' });
  await audit(`moderation.${verdict}`, actorId, found.targetType, targetId, { caseId, note, ...strike });
  return { ...strike, status };
}

/** Rules on an appeal of an already decided case. Granting reverses the take-down and the strike. */
export async function decideAppeal(actorId: string, caseId: string, grant: boolean, note: string) {
  const found: any = await ModerationCase.findOneAndUpdate({ _id: caseId, status: 'upheld', 'appeal.status': 'pending' }, { 'appeal.status': grant ? 'granted' : 'denied', 'appeal.decidedBy': actorId, 'appeal.decidedAt': new Date(), 'appeal.note': note, ...(grant ? { status: 'dismissed' } : {}) }, { new: false });
  if (!found) throw new AppError(409, 'This appeal has already been decided.', 'APPEAL_DECIDED');
  const targetId = String(found.targetId), authorId = String(found.authorId);
  if (grant) {
    await restore(found.targetType, targetId);
    await User.updateOne({ _id: authorId, strikes: { $gt: 0 } }, { $inc: { strikes: -1 } });
  }
  await notifySystem({ recipientId: authorId, type: 'moderation', ...noticeEntity(found.targetType, targetId, authorId), text: grant ? `accepted your appeal and restored your ${TARGET_NAMES[found.targetType] || 'content'}.` : 'reviewed your appeal and kept the decision.' });
  await audit(grant ? 'moderation.appeal_grant' : 'moderation.appeal_deny', actorId, found.targetType, targetId, { caseId, note });
}

/* ---------- Members ---------- */

const REPORTABLE: TargetType[] = ['Post', 'Comment', 'Story', 'User', 'Group', 'Message', 'AdCampaign'];

/** Reports raise a case's priority but never take anything down, so a coordinated pile-on cannot silence someone. */
export async function createReport(reporterId: string, input: { targetType: string; targetId: string; reason: string; note?: string }) {
  const targetType = input.targetType as TargetType;
  if (!REPORTABLE.includes(targetType)) throw new AppError(422, 'This cannot be reported.', 'VALIDATION_ERROR');
  const target = await loadTarget(targetType, input.targetId);
  if (!target) throw new AppError(404, 'This content is no longer available.', 'NOT_FOUND');
  if (target.authorId === reporterId) throw new AppError(400, 'You cannot report your own content.', 'SELF_REPORT');
  if (targetType === 'Message') {
    // Staff only ever see a private message because someone in that conversation showed it to them.
    const message: any = await Message.findById(input.targetId).populate('conversationId', 'memberIds').lean();
    if (!message?.conversationId?.memberIds?.some((member: unknown) => String(member) === reporterId)) throw new AppError(404, 'This content is no longer available.', 'NOT_FOUND');
  }
  try {
    const report = await Report.create({ reporterId, targetType, targetId: input.targetId, reason: input.reason, note: input.note || '' });
    const moderationCase = await openCase({ targetType, targetId: input.targetId, source: 'report', categories: [input.reason], priority: 3 });
    if (moderationCase) await Promise.all([ModerationCase.updateOne({ _id: moderationCase._id }, { $inc: { reportCount: 1 } }), Report.updateOne({ _id: report._id }, { caseId: moderationCase._id })]);
  } catch (error: any) {
    // Reporting the same thing twice is harmless: the first report already counts.
    if (error?.code !== 11000) throw error;
  }
}

/** Decisions about this member's own content, for Settings. */
export async function myCases(userId: string) {
  return ModerationCase.find({ authorId: userId, $or: [{ autoAction: 'removed' }, { status: 'upheld' }] }).sort({ createdAt: -1 }).limit(30)
    .select('targetType targetId snippet categories status autoAction appeal createdAt decidedAt').lean();
}

export async function appealCase(userId: string, caseId: string, message: string) {
  const updated = await ModerationCase.findOneAndUpdate(
    { _id: caseId, authorId: userId, 'appeal.status': 'none', $or: [{ autoAction: 'removed' }, { status: 'upheld' }] },
    { appeal: { status: 'pending', message, at: new Date() }, $inc: { priority: 5 } }
  );
  if (!updated) throw new AppError(409, 'This decision cannot be appealed, or was already appealed.', 'APPEAL_UNAVAILABLE');
}
