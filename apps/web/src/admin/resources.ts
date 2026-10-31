import type { ActionContext, ActionRequest, ActionResponse, ResourceWithOptions } from 'adminjs';
import { AdAccount, AdCampaign, AuditLog, Call, Comment, Conversation, Group, LedgerEntry, ModerationCase, PaymentOrder, ModerationPolicy, ModerationScan, Post, Report, Story, User } from '../models/index.js';
import { adjustBalance, reviewCampaign } from '../services/ads.service.js';
import { decideAppeal, decideCase } from '../services/moderation.service.js';
import { banUser, reinstateUser, setUserRole, suspendUser, warnUser } from '../services/account.service.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/errors.js';
import { components } from './components.js';

type Guard = (context: ActionContext) => boolean;
const role = (context: ActionContext) => context.currentAdmin?.role as string | undefined;
export const adminOnly: Guard = (context) => role(context) === 'admin';
export const staff: Guard = (context) => role(context) === 'admin' || role(context) === 'moderator';
const nobody: Guard = () => false;

/** Read-only by default: anything that changes data has to be an explicit action below. */
export const readOnly = (show: Guard = staff) => ({
  list: { isAccessible: show },
  show: { isAccessible: show },
  search: { isAccessible: show },
  new: { isAccessible: nobody },
  edit: { isAccessible: nobody },
  delete: { isAccessible: nobody },
  bulkDelete: { isAccessible: nobody }
});

const SAFETY = { name: 'Safety', icon: 'Shield' };
const ADS = { name: 'Ads', icon: 'Volume2' };
const CONTENT = { name: 'Content', icon: 'Document' };
const PEOPLE = { name: 'People', icon: 'User' };

/** Runs an action's work and reports the outcome (including rule refusals such as "cannot ban an admin") as a notice. */
export function recordAction(work: (record: any, input: { reason: string; days: number; amount: number }, actorId: string, request: ActionRequest) => Promise<string>) {
  return async (request: ActionRequest, _response: unknown, context: ActionContext): Promise<ActionResponse> => {
    const record = context.record!;
    const toResponse = (message: string, type: 'success' | 'error') => ({
      record: record.toJSON(context.currentAdmin),
      redirectUrl: context.h.resourceUrl({ resourceId: context.resource.id() }),
      notice: { message, type }
    });
    if (request.method !== 'post') return { record: record.toJSON(context.currentAdmin) };
    const payload = request.payload || {};
    const reason = String(payload.reason || '').trim().slice(0, 500);
    const days = Number(payload.days) || 0;
    const amount = Number(payload.amount) || 0;
    try {
      return toResponse(await work(record, { reason, days, amount }, String(context.currentAdmin?.id), request), 'success');
    } catch (error) {
      if (error instanceof AppError) return toResponse(error.message, 'error');
      throw error;
    }
  };
}

const reasonAction = (label: string, custom: Record<string, unknown>, handler: ReturnType<typeof recordAction>, isAccessible: Guard = staff) => ({
  actionType: 'record' as const,
  label,
  icon: custom.icon as string | undefined,
  component: components.ReasonAction,
  custom,
  isAccessible,
  handler
});

const requireReason = (reason: string) => { if (!reason) throw new AppError(422, 'A reason is required.', 'VALIDATION_ERROR'); return reason; };

const userResource: ResourceWithOptions = {
  resource: User,
  options: {
    navigation: PEOPLE,
    sort: { sortBy: 'createdAt', direction: 'desc' },
    listProperties: ['displayName', 'username', 'email', 'role', 'status', 'strikes', 'createdAt'],
    filterProperties: ['username', 'email', 'displayName', 'role', 'status', 'createdAt'],
    showProperties: ['displayName', 'username', 'email', 'role', 'status', 'suspendedUntil', 'restrictionReason', 'strikes', 'lastSeenAt', 'createdAt', 'deletedAt'],
    actions: {
      ...readOnly(),
      warn: reasonAction('Warn', { icon: 'AlertCircle', submitLabel: 'Send warning', reasonLabel: 'What the member will be told' },
        recordAction(async (record, { reason }, actorId) => { await warnUser(actorId, record.id(), requireReason(reason)); return 'Warning sent.'; })),
      suspend: reasonAction('Suspend', { icon: 'Pause', days: 7, submitLabel: 'Suspend account', variant: 'danger', warning: 'Signs the member out everywhere until the date passes.' },
        recordAction(async (record, { reason, days }, actorId) => {
          if (days < 1 || days > 365) throw new AppError(422, 'Choose between 1 and 365 days.', 'VALIDATION_ERROR');
          await suspendUser(actorId, record.id(), { until: new Date(Date.now() + days * 86_400_000), reason: requireReason(reason) });
          return `Suspended for ${days} days.`;
        })),
      ban: reasonAction('Ban', { icon: 'Slash', submitLabel: 'Ban account', variant: 'danger', warning: 'Signs the member out everywhere and blocks sign-in until an admin reinstates the account.' },
        recordAction(async (record, { reason }, actorId) => { await banUser(actorId, record.id(), requireReason(reason)); return 'Account banned.'; }), adminOnly),
      reinstate: reasonAction('Reinstate', { icon: 'Play', noReason: true, submitLabel: 'Lift restriction' },
        recordAction(async (record, _input, actorId) => { await reinstateUser(actorId, record.id()); return 'Restriction lifted.'; }), adminOnly),
      makeModerator: reasonAction('Make moderator', { icon: 'Star', noReason: true, submitLabel: 'Make moderator' },
        recordAction(async (record, _input, actorId) => { await setUserRole(actorId, record.id(), 'moderator'); return 'Now a moderator.'; }), adminOnly),
      makeAdmin: reasonAction('Make admin', { icon: 'Award', noReason: true, submitLabel: 'Make admin', variant: 'danger', warning: 'Admins can change roles, ban members and move money.' },
        recordAction(async (record, _input, actorId) => { await setUserRole(actorId, record.id(), 'admin'); return 'Now an admin.'; }), adminOnly),
      removeStaffRole: reasonAction('Remove staff role', { icon: 'UserX', noReason: true, submitLabel: 'Remove role' },
        recordAction(async (record, _input, actorId) => { await setUserRole(actorId, record.id(), 'user'); return 'Role removed.'; }), adminOnly)
    }
  }
};

/** Soft-deletes content the same way the owner's own delete does, with a record of who did it. */
const hideContent = (type: string) => reasonAction('Hide', { icon: 'EyeOff', submitLabel: 'Hide', variant: 'danger' },
  recordAction(async (record, { reason }, actorId) => {
    await record.update({ deletedAt: new Date() });
    await audit(`${type.toLowerCase()}.hide`, actorId, type, record.id(), { reason: requireReason(reason) });
    return 'Hidden.';
  }));

const contentResource = (resource: unknown, type: string, list: string[]): ResourceWithOptions => ({
  resource,
  options: {
    navigation: CONTENT,
    sort: { sortBy: 'createdAt', direction: 'desc' },
    listProperties: list,
    actions: { ...readOnly(), hide: hideContent(type) }
  }
});

const caseResource: ResourceWithOptions = {
  resource: ModerationCase,
  options: {
    navigation: SAFETY,
    // Worst first; the queue is meant to be worked from the top.
    sort: { sortBy: 'priority', direction: 'desc' },
    listProperties: ['status', 'priority', 'targetType', 'source', 'categories', 'autoAction', 'reportCount', 'appeal.status', 'createdAt'],
    filterProperties: ['status', 'targetType', 'source', 'autoAction', 'appeal.status', 'authorId', 'createdAt'],
    showProperties: ['status', 'targetType', 'targetId', 'authorId', 'snippet', 'mediaUrls', 'categories', 'scores', 'models', 'source', 'autoAction', 'reportCount', 'priority', 'appeal.status', 'appeal.message', 'appeal.at', 'decidedBy', 'decidedAt', 'decisionNote', 'createdAt'],
    actions: {
      ...readOnly(),
      uphold: reasonAction('Remove content', { icon: 'Trash2', submitLabel: 'Remove and record a strike', variant: 'danger', reasonLabel: 'Why this breaks the rules' },
        recordAction(async (record, { reason }, actorId) => {
          const result = await decideCase(actorId, record.id(), 'uphold', requireReason(reason));
          return `Removed. Strike ${result.strikes}: ${result.consequence}.`;
        })),
      dismiss: reasonAction('Keep content', { icon: 'Check', submitLabel: 'Keep and close', reasonLabel: 'Why this is fine' },
        recordAction(async (record, { reason }, actorId) => { await decideCase(actorId, record.id(), 'dismiss', requireReason(reason)); return 'Content kept.'; })),
      grantAppeal: reasonAction('Grant appeal', { icon: 'RotateCcw', submitLabel: 'Restore content', reasonLabel: 'Note' },
        recordAction(async (record, { reason }, actorId) => { await decideAppeal(actorId, record.id(), true, requireReason(reason)); return 'Appeal granted.'; })),
      denyAppeal: reasonAction('Deny appeal', { icon: 'X', submitLabel: 'Keep the decision', reasonLabel: 'Note' },
        recordAction(async (record, { reason }, actorId) => { await decideAppeal(actorId, record.id(), false, requireReason(reason)); return 'Appeal denied.'; }))
    }
  }
};

const policyResource: ResourceWithOptions = {
  resource: ModerationPolicy,
  options: {
    navigation: SAFETY,
    listProperties: ['category', 'review', 'block', 'autoRemove'],
    editProperties: ['review', 'block', 'autoRemove'],
    actions: {
      ...readOnly(),
      edit: {
        isAccessible: adminOnly,
        after: async (response: ActionResponse, request: ActionRequest, context: ActionContext) => {
          if (request.method === 'post') await audit('moderation.policy', String(context.currentAdmin?.id), 'ModerationPolicy', context.record?.id(), { change: request.payload });
          return response;
        }
      }
    }
  }
};

const campaignResource: ResourceWithOptions = {
  resource: AdCampaign,
  options: {
    navigation: ADS,
    sort: { sortBy: 'createdAt', direction: 'desc' },
    listProperties: ['name', 'advertiserId', 'status', 'cpm', 'totalBudget', 'spent', 'impressions', 'clicks', 'createdAt'],
    filterProperties: ['status', 'advertiserId', 'createdAt'],
    showProperties: ['name', 'advertiserId', 'status', 'headline', 'body', 'mediaUrl', 'ctaLabel', 'ctaUrl', 'topics', 'cpm', 'dailyBudget', 'totalBudget', 'spent', 'impressions', 'clicks', 'rejectionReason', 'reviewedBy', 'reviewedAt', 'createdAt'],
    actions: {
      ...readOnly(),
      approve: reasonAction('Approve', { icon: 'Check', noReason: true, submitLabel: 'Approve and run' },
        recordAction(async (record, _input, actorId) => { await reviewCampaign(actorId, record.id(), true, ''); return 'Campaign approved.'; }), adminOnly),
      reject: reasonAction('Reject', { icon: 'X', submitLabel: 'Reject', variant: 'danger', reasonLabel: 'What the advertiser will be told' },
        recordAction(async (record, { reason }, actorId) => { await reviewCampaign(actorId, record.id(), false, requireReason(reason)); return 'Campaign rejected.'; }), adminOnly)
    }
  }
};

const accountResource: ResourceWithOptions = {
  resource: AdAccount,
  options: {
    navigation: ADS,
    listProperties: ['userId', 'balance', 'updatedAt'],
    actions: {
      ...readOnly(adminOnly),
      adjustBalance: reasonAction('Adjust balance', { icon: 'DollarSign', amount: true, submitLabel: 'Apply', variant: 'danger', warning: 'Moves real money. Positive adds to the wallet, negative takes away. This is recorded in the ledger and audit log.' },
        recordAction(async (record, { reason, amount }, actorId) => { await adjustBalance(actorId, String(record.get('userId')), amount, requireReason(reason)); return 'Balance adjusted.'; }), adminOnly)
    }
  }
};

export const adminResources: ResourceWithOptions[] = [
  caseResource,
  campaignResource,
  accountResource,
  { resource: LedgerEntry, options: { navigation: ADS, sort: { sortBy: 'createdAt', direction: 'desc' }, listProperties: ['userId', 'type', 'amount', 'balanceAfter', 'note', 'createdAt'], actions: { ...readOnly(adminOnly) } } },
  { resource: PaymentOrder, options: { navigation: ADS, sort: { sortBy: 'createdAt', direction: 'desc' }, listProperties: ['userId', 'txnRef', 'amount', 'status', 'paidAt', 'createdAt'], actions: { ...readOnly(adminOnly) } } },
  { resource: Report, options: { navigation: SAFETY, sort: { sortBy: 'createdAt', direction: 'desc' }, listProperties: ['targetType', 'reason', 'status', 'note', 'reporterId', 'createdAt'], actions: { ...readOnly() } } },
  policyResource,
  { resource: ModerationScan, options: { navigation: SAFETY, sort: { sortBy: 'createdAt', direction: 'desc' }, listProperties: ['targetType', 'decision', 'categories', 'shadow', 'createdAt'], actions: { ...readOnly() } } },
  userResource,
  contentResource(Post, 'Post', ['content', 'authorId', 'visibility', 'reactionCount', 'createdAt', 'deletedAt']),
  contentResource(Comment, 'Comment', ['content', 'authorId', 'postId', 'createdAt', 'deletedAt']),
  contentResource(Story, 'Story', ['text', 'authorId', 'audience', 'expiresAt', 'deletedAt']),
  { resource: Group, options: { navigation: CONTENT, sort: { sortBy: 'createdAt', direction: 'desc' }, listProperties: ['name', 'privacy', 'memberCount', 'ownerId', 'createdAt'], actions: { ...readOnly() } } },
  // Only so references to it resolve (AdminJS throws otherwise). No staff role can open it: conversations stay private.
  { resource: Conversation, options: { navigation: false, actions: { ...readOnly(nobody) } } },
  { resource: Call, options: { navigation: SAFETY, sort: { sortBy: 'createdAt', direction: 'desc' }, listProperties: ['kind', 'status', 'callerId', 'calleeId', 'endReason', 'createdAt'], actions: { ...readOnly(adminOnly) } } },
  { resource: AuditLog, options: { navigation: SAFETY, sort: { sortBy: 'createdAt', direction: 'desc' }, listProperties: ['action', 'actorId', 'targetType', 'targetId', 'createdAt'], actions: { ...readOnly() } } }
];
