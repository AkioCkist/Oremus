import { populator, type ActionContext, type ActionRequest, type ActionResponse, type ResourceWithOptions } from 'adminjs';
import { AdAccount, AdCampaign, AuditLog, Call, Comment, Conversation, Group, LedgerEntry, ModerationCase, PaymentOrder, ModerationPolicy, ModerationScan, Post, Report, Story, User } from '../models/index.js';
import { adjustBalance, reviewCampaign } from '../services/ads.service.js';
import { decideAppeal, decideCase } from '../services/moderation.service.js';
import { banUser, reinstateUser, setUserRole, suspendUser, warnUser } from '../services/account.service.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/errors.js';
import { components } from './components.js';
import { INTEREST_OPTIONS } from '../shared/interests.js';

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

/* ---------- Presentation: list cells and record pages ---------- */

const CELLS = {
  pill: components.CellPill,
  person: components.CellPerson,
  date: components.CellDate,
  text: components.CellText,
  thumb: components.CellThumb,
  percent: components.CellPercent,
  money: components.Money
};
type Cell = keyof typeof CELLS;

/** How each listed property is drawn in tables: pills for enums, avatars for people, "2 hours ago" for dates... */
const cells = (map: Record<string, Cell>) => Object.fromEntries(Object.entries(map).map(([path, cell]) => [path, { components: { list: CELLS[cell] } }]));
const dates = (...paths: string[]) => Object.fromEntries(paths.map((path) => [path, 'date' as Cell]));

const topicLabels = Object.fromEntries(INTEREST_OPTIONS.map((option) => [option.key, option.label]));

/** Read-only actions plus the visual record page (RecordShow.jsx) for `kind`. */
const visual = (kind: string, guard: Guard = staff, custom: Record<string, unknown> = {}) => ({
  ...readOnly(guard),
  show: { isAccessible: guard, component: components.RecordShow, custom: { kind, ...custom } }
});

/**
 * Runs an action's work and reports the outcome (including rule refusals such as "cannot ban an admin") as a notice.
 * `direct` actions have no form: AdminJS calls them straight from the button (as a GET, which mount.ts only accepts
 * from the panel itself) and the page updates in place with the fresh record.
 */
export function recordAction(work: (record: any, input: { reason: string; days: number; amount: number }, actorId: string, request: ActionRequest) => Promise<string>, { direct = false } = {}) {
  return async (request: ActionRequest, _response: unknown, context: ActionContext): Promise<ActionResponse> => {
    const record = context.record!;
    const toResponse = async (message: string, type: 'success' | 'error') => {
      const fresh = (await context.resource.findOne(record.id(), context)) ?? record;
      await populator([fresh], context);
      return {
        record: fresh.toJSON(context.currentAdmin),
        ...(direct ? {} : { redirectUrl: context.h.recordActionUrl({ resourceId: context.resource.id(), recordId: record.id(), actionName: 'show' }) }),
        notice: { message, type }
      };
    };
    if (request.method !== 'post' && !direct) return { record: record.toJSON(context.currentAdmin) };
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

/** One-click action: no form page. `confirm` shows AdminJS's in-page "are you sure" dialog first. */
const directAction = (label: string, icon: string, work: Parameters<typeof recordAction>[0], isAccessible: Guard = staff, confirm?: string) => ({
  actionType: 'record' as const,
  label,
  icon,
  component: false as const,
  ...(confirm ? { guard: confirm } : {}),
  isAccessible,
  handler: recordAction(work, { direct: true })
});

const requireReason = (reason: string) => { if (!reason) throw new AppError(422, 'A reason is required.', 'VALIDATION_ERROR'); return reason; };

const userResource: ResourceWithOptions = {
  resource: User,
  options: {
    navigation: PEOPLE,
    sort: { sortBy: 'createdAt', direction: 'desc' },
    listProperties: ['profile.avatarUrl', 'displayName', 'username', 'email', 'role', 'status', 'strikes', 'lastSeenAt', 'createdAt'],
    filterProperties: ['username', 'email', 'displayName', 'role', 'status', 'createdAt'],
    showProperties: ['displayName', 'username', 'email', 'role', 'status', 'suspendedUntil', 'restrictionReason', 'strikes', 'lastSeenAt', 'createdAt', 'deletedAt'],
    properties: cells({ 'profile.avatarUrl': 'thumb', role: 'pill', status: 'pill', ...dates('lastSeenAt', 'createdAt') }),
    actions: {
      ...visual('user', staff, { topicLabels }),
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
      reinstate: directAction('Reinstate', 'Play',
        async (record, _input, actorId) => { await reinstateUser(actorId, record.id()); return 'Restriction lifted.'; }, adminOnly),
      makeModerator: directAction('Make moderator', 'Star',
        async (record, _input, actorId) => { await setUserRole(actorId, record.id(), 'moderator'); return 'Now a moderator.'; }, adminOnly),
      makeAdmin: directAction('Make admin', 'Award',
        async (record, _input, actorId) => { await setUserRole(actorId, record.id(), 'admin'); return 'Now an admin.'; }, adminOnly,
        'Make this member an admin? Admins can change roles, ban members and move money.'),
      removeStaffRole: directAction('Remove staff role', 'UserX',
        async (record, _input, actorId) => { await setUserRole(actorId, record.id(), 'user'); return 'Role removed.'; }, adminOnly)
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

const contentResource = (resource: unknown, type: string, list: string[], listCells: Record<string, Cell>): ResourceWithOptions => ({
  resource,
  options: {
    navigation: CONTENT,
    sort: { sortBy: 'createdAt', direction: 'desc' },
    listProperties: list,
    properties: (() => {
      const props: Record<string, Record<string, unknown>> = cells({ authorId: 'person', moderationStatus: 'pill', ...dates('createdAt', 'deletedAt', 'expiresAt'), ...listCells });
      // The text is what identifies a post/comment/story in links and references elsewhere in the panel.
      const titleField = list.includes('content') ? 'content' : 'text';
      props[titleField] = { ...props[titleField], isTitle: true };
      return props;
    })(),
    actions: { ...visual(type.toLowerCase(), staff, { hide: ['seedKey'] }), hide: hideContent(type) }
  }
});

const caseResource: ResourceWithOptions = {
  resource: ModerationCase,
  options: {
    navigation: SAFETY,
    // Worst first; the queue is meant to be worked from the top.
    sort: { sortBy: 'priority', direction: 'desc' },
    listProperties: ['mediaUrls', 'snippet', 'status', 'priority', 'targetType', 'authorId', 'source', 'categories', 'autoAction', 'reportCount', 'appeal.status', 'createdAt'],
    filterProperties: ['status', 'targetType', 'source', 'autoAction', 'appeal.status', 'authorId', 'createdAt'],
    showProperties: ['status', 'targetType', 'targetId', 'authorId', 'snippet', 'mediaUrls', 'categories', 'scores', 'models', 'source', 'autoAction', 'reportCount', 'priority', 'appeal.status', 'appeal.message', 'appeal.at', 'decidedBy', 'decidedAt', 'decisionNote', 'createdAt'],
    properties: cells({ mediaUrls: 'thumb', snippet: 'text', authorId: 'person', status: 'pill', targetType: 'pill', source: 'pill', categories: 'pill', autoAction: 'pill', 'appeal.status': 'pill', createdAt: 'date' }),
    actions: {
      ...visual('case'),
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
    properties: cells({ review: 'percent', block: 'percent', autoRemove: 'pill' }),
    actions: {
      ...visual('policy'),
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
    listProperties: ['mediaUrl', 'name', 'headline', 'advertiserId', 'status', 'cpm', 'totalBudget', 'spent', 'impressions', 'clicks', 'createdAt'],
    filterProperties: ['status', 'advertiserId', 'createdAt'],
    showProperties: ['name', 'advertiserId', 'status', 'headline', 'body', 'mediaUrl', 'ctaLabel', 'ctaUrl', 'topics', 'cpm', 'dailyBudget', 'totalBudget', 'spent', 'impressions', 'clicks', 'rejectionReason', 'reviewedBy', 'reviewedAt', 'createdAt'],
    properties: cells({ mediaUrl: 'thumb', headline: 'text', advertiserId: 'person', status: 'pill', cpm: 'money', dailyBudget: 'money', totalBudget: 'money', spent: 'money', createdAt: 'date' }),
    actions: {
      // Reviewers judge an ad by how it will look, so the record page renders the feed card next to budget and results.
      ...visual('campaign', staff, { topicLabels, money: ['cpm', 'dailyBudget', 'totalBudget', 'spent'] }),
      approve: directAction('Approve', 'Check',
        async (record, _input, actorId) => { await reviewCampaign(actorId, record.id(), true, ''); return 'Campaign approved.'; }, adminOnly),
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
    properties: cells({ userId: 'person', balance: 'money', updatedAt: 'date' }),
    actions: {
      ...visual('account', adminOnly, { money: ['balance'] }),
      adjustBalance: reasonAction('Adjust balance', { icon: 'DollarSign', amount: true, submitLabel: 'Apply', variant: 'danger', warning: 'Moves real money. Positive adds to the wallet, negative takes away. This is recorded in the ledger and audit log.' },
        recordAction(async (record, { reason, amount }, actorId) => { await adjustBalance(actorId, String(record.get('userId')), amount, requireReason(reason)); return 'Balance adjusted.'; }), adminOnly)
    }
  }
};

export const adminResources: ResourceWithOptions[] = [
  caseResource,
  campaignResource,
  accountResource,
  {
    resource: LedgerEntry,
    options: {
      navigation: ADS, sort: { sortBy: 'createdAt', direction: 'desc' },
      listProperties: ['userId', 'type', 'amount', 'balanceAfter', 'note', 'createdAt'],
      properties: cells({ userId: 'person', type: 'pill', amount: 'money', balanceAfter: 'money', note: 'text', createdAt: 'date' }),
      actions: { ...visual('ledger', adminOnly, { money: ['amount', 'balanceAfter'] }) }
    }
  },
  {
    resource: PaymentOrder,
    options: {
      navigation: ADS, sort: { sortBy: 'createdAt', direction: 'desc' },
      listProperties: ['userId', 'amount', 'status', 'txnRef', 'paidAt', 'createdAt'],
      properties: cells({ userId: 'person', amount: 'money', status: 'pill', ...dates('paidAt', 'createdAt') }),
      actions: { ...visual('payment', adminOnly, { money: ['amount'] }) }
    }
  },
  {
    resource: Report,
    options: {
      navigation: SAFETY, sort: { sortBy: 'createdAt', direction: 'desc' },
      listProperties: ['reason', 'targetType', 'status', 'note', 'reporterId', 'createdAt'],
      properties: cells({ reason: 'pill', targetType: 'pill', status: 'pill', note: 'text', reporterId: 'person', createdAt: 'date' }),
      actions: { ...visual('report') }
    }
  },
  policyResource,
  {
    resource: ModerationScan,
    options: {
      navigation: SAFETY, sort: { sortBy: 'createdAt', direction: 'desc' },
      listProperties: ['decision', 'targetType', 'categories', 'authorId', 'shadow', 'createdAt'],
      properties: cells({ decision: 'pill', targetType: 'pill', categories: 'pill', authorId: 'person', shadow: 'pill', createdAt: 'date' }),
      actions: { ...visual('scan') }
    }
  },
  userResource,
  contentResource(Post, 'Post', ['media', 'content', 'authorId', 'visibility', 'moderationStatus', 'reactionCount', 'commentCount', 'createdAt', 'deletedAt'], { media: 'thumb', content: 'text', visibility: 'pill' }),
  contentResource(Comment, 'Comment', ['content', 'authorId', 'postId', 'moderationStatus', 'createdAt', 'deletedAt'], { content: 'text' }),
  contentResource(Story, 'Story', ['media', 'text', 'authorId', 'audience', 'viewCount', 'moderationStatus', 'expiresAt', 'deletedAt'], { media: 'thumb', text: 'text', audience: 'pill' }),
  {
    resource: Group,
    options: {
      navigation: CONTENT, sort: { sortBy: 'createdAt', direction: 'desc' },
      listProperties: ['coverUrl', 'name', 'privacy', 'groupType', 'memberCount', 'ownerId', 'createdAt'],
      properties: cells({ coverUrl: 'thumb', privacy: 'pill', groupType: 'pill', ownerId: 'person', createdAt: 'date' }),
      actions: { ...visual('group') }
    }
  },
  // Only so references to it resolve (AdminJS throws otherwise). No staff role can open it: conversations stay private.
  { resource: Conversation, options: { navigation: false, actions: { ...readOnly(nobody) } } },
  {
    resource: Call,
    options: {
      navigation: SAFETY, sort: { sortBy: 'createdAt', direction: 'desc' },
      listProperties: ['callerId', 'calleeId', 'kind', 'status', 'endReason', 'createdAt'],
      properties: cells({ callerId: 'person', calleeId: 'person', kind: 'pill', status: 'pill', createdAt: 'date' }),
      actions: { ...visual('call', adminOnly) }
    }
  },
  {
    resource: AuditLog,
    options: {
      navigation: SAFETY, sort: { sortBy: 'createdAt', direction: 'desc' },
      listProperties: ['action', 'actorId', 'targetType', 'targetId', 'createdAt'],
      properties: cells({ actorId: 'person', targetType: 'pill', createdAt: 'date' }),
      actions: { ...visual('audit') }
    }
  }
];
