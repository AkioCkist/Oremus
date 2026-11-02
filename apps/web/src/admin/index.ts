import { buildRouter } from '@adminjs/express';
import { Database, Resource } from '@adminjs/mongoose';
import AdminJS, { type AdminJSOptions } from 'adminjs';
import type { RequestHandler } from 'express';
import { ADMIN_PATH } from './mount.js';
import { componentLoader, components } from './components.js';
import { adminMetrics } from './metrics.js';
import { adminResources } from './resources.js';
import { isPeriod, monitoringSnapshot, type Section } from '../monitoring/read.js';

/** A monitoring page: infrastructure details are for admins only; the period comes from the page's picker. */
const monitoringPage = (section: Section, component: string, icon: string): NonNullable<AdminJSOptions['pages']>[string] => ({
  component,
  icon,
  handler: async (request, _response, context) => {
    if (context.currentAdmin?.role !== 'admin') return { error: 'Only admins can see system monitoring.' };
    const period = request.query?.period;
    return monitoringSnapshot(isPeriod(period) ? period : '1h', section);
  }
});

AdminJS.registerAdapter({ Database, Resource });

/** Dark palette shared with the custom components (components/ui.jsx T), mapped onto AdminJS theme tokens. Text passes 4.5:1 on every surface. */
const adminTheme = {
  colors: {
    primary100: '#A78BFA', primary80: '#C4B5FD', primary60: '#6D5BB8', primary40: '#3B2F66', primary20: '#221C3A',
    accent: '#A78BFA', love: '#A78BFA', white: '#14161D',
    text: '#EDEEF2', grey100: '#EDEEF2', grey80: '#C9CDD6', grey60: '#A3A9B6', grey40: '#3B4252', grey20: '#1A1D26',
    error: '#F87171', errorDark: '#FCA5A5', errorLight: '#2A1416',
    success: '#4ADE80', successDark: '#86EFAC', successLight: '#0F2A1A',
    warning: '#FBBF24', warningDark: '#FCD34D', warningLight: '#2A2010',
    info: '#A78BFA', infoDark: '#C4B5FD', infoLight: '#221C3A',
    bg: '#0B0C10', container: '#14161D', sidebar: '#101218', filterBg: '#101218',
    border: '#232733', inputBorder: '#2A2F3B', separator: '#232733', highlight: '#171A22'
  },
  font: 'Inter, "Be Vietnam Pro", -apple-system, "Segoe UI", system-ui, sans-serif',
  shadows: { card: '0 0 0 1px #232733', cardHover: '0 0 0 1px #3B2F66' }
} as unknown as NonNullable<Exclude<AdminJSOptions['branding'], (...args: never[]) => unknown>>['theme']; // AdminJS types `font` as a record, but the theme value is a plain CSS font stack.

const RESOURCE_LABELS: Record<string, string> = {
  ModerationCase: 'Moderation cases', Report: 'Reports', ModerationPolicy: 'Policies', ModerationScan: 'Scans', Call: 'Calls', AuditLog: 'Audit log',
  AdCampaign: 'Ad campaigns', AdAccount: 'Ad wallets', LedgerEntry: 'Ledger', PaymentOrder: 'Payments',
  User: 'Members', Post: 'Posts', Comment: 'Comments', Story: 'Stories', Group: 'Groups'
};

export const adminOptions: AdminJSOptions = {
  rootPath: ADMIN_PATH,
  componentLoader,
  branding: { companyName: 'Oremus Admin', withMadeWithLove: false, logo: false, favicon: '/assets/brand/favicon.svg', theme: adminTheme },
  // Inter plus the dark shell, tables and forms (see public/assets/admin.css).
  assets: { styles: ['https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', '/assets/admin.css'] },
  dashboard: { component: components.Dashboard, handler: adminMetrics },
  // Pulse-style system monitoring (src/monitoring), one page per section with tabs between them.
  pages: {
    monitoring: monitoringPage('overview', components.Monitoring, 'Activity'),
    servers: monitoringPage('servers', components.MonitorServers, 'Server'),
    requests: monitoringPage('requests', components.MonitorRequests, 'Globe'),
    exceptions: monitoringPage('exceptions', components.MonitorExceptions, 'AlertTriangle'),
    database: monitoringPage('database', components.MonitorDatabase, 'Database'),
    cache: monitoringPage('cache', components.MonitorCache, 'Zap'),
    queues: monitoringPage('queues', components.MonitorQueues, 'Layers'),
    outgoing: monitoringPage('outgoing', components.MonitorOutgoing, 'ExternalLink'),
    usage: monitoringPage('usage', components.MonitorUsage, 'Users')
  },
  resources: adminResources,
  // Staff land on the site's own login; there is no second password for the panel.
  locale: {
    language: 'en',
    translations: {
      en: {
        actions: { show: 'Details', list: 'All' },
        pages: {
          monitoring: 'Monitoring', servers: 'Servers', requests: 'Requests', exceptions: 'Exceptions', database: 'Database',
          cache: 'Cache', queues: 'Queues & jobs', outgoing: 'Outgoing HTTP', usage: 'Usage'
        },
        labels: RESOURCE_LABELS,
        // A list page is titled with the resource ("Members"), not the action name.
        resources: Object.fromEntries(Object.entries(RESOURCE_LABELS).map(([id, label]) => [id, { actions: { list: label } }])),
        properties: {
          authorId: 'Author', advertiserId: 'Advertiser', userId: 'Member', reporterId: 'Reporter', ownerId: 'Owner', actorId: 'By', callerId: 'Caller', calleeId: 'Callee',
          decidedBy: 'Decided by', reviewedBy: 'Reviewed by', createdAt: 'Created', updatedAt: 'Updated', deletedAt: 'Deleted', editedAt: 'Edited', expiresAt: 'Expires',
          'profile.avatarUrl': 'Photo', mediaUrls: 'Media', mediaUrl: 'Image', media: 'Media', coverUrl: 'Cover', snippet: 'Content',
          targetType: 'About', targetId: 'Target', postId: 'Post', groupId: 'Group', sharedPostId: 'Shared post', parentId: 'Reply to', caseId: 'Case',
          cpm: 'Per 1,000 views', 'appeal.status': 'Appeal', moderationStatus: 'Moderation', reactionCount: 'Reactions', commentCount: 'Comments', shareCount: 'Shares',
          viewCount: 'Views', reportCount: 'Reports', memberCount: 'Members', txnRef: 'Order ref', balanceAfter: 'Balance after', lastSeenAt: 'Last seen',
          autoAction: 'Auto action', autoRemove: 'Auto-remove', groupType: 'Type', endReason: 'End reason'
        }
      }
    }
  },
  loginPath: '/login',
  logoutPath: '/auth/logout'
};

export function buildAdminRouter(): RequestHandler {
  return buildRouter(new AdminJS(adminOptions));
}
