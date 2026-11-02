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

/** The site's light palette (styles.css :root) mapped onto AdminJS theme tokens, so the panel reads as part of Oremus. */
const adminTheme = {
  colors: {
    primary100: '#0088FF', primary80: '#4DACFF', primary60: '#99CFFF', primary40: '#CCE7FF', primary20: '#E5F3FF',
    accent: '#0088FF', love: '#0088FF',
    text: '#000000', grey100: '#000000', grey80: '#3C3C43', grey60: '#8A8A8E', grey40: '#C7C7CC', grey20: '#F2F2F7',
    error: '#FF383C', errorDark: '#D70015', errorLight: '#FFE5E6',
    success: '#248A3D', successDark: '#1E7A35', successLight: '#E3F7E8',
    warning: '#C25E00', warningDark: '#A14F00', warningLight: '#FFF1E0',
    info: '#0088FF', infoDark: '#0070D6', infoLight: '#E5F3FF',
    bg: '#F2F2F7', container: '#FFFFFF', sidebar: '#FFFFFF', filterBg: '#FFFFFF',
    border: '#E0E0E0', inputBorder: '#E0E0E0', separator: '#E0E0E0', highlight: '#F4F4F5'
  },
  font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Be Vietnam Pro", "Segoe UI", system-ui, sans-serif',
  shadows: { card: '0 0 0 1px rgba(0,0,0,0.07), 0 2px 12px rgba(0,0,0,0.03)', cardHover: '0 0 0 1px rgba(0,0,0,0.09), 0 4px 16px rgba(0,0,0,0.06)' }
} as unknown as NonNullable<Exclude<AdminJSOptions['branding'], (...args: never[]) => unknown>>['theme']; // AdminJS types `font` as a record, but the theme value is a plain CSS font stack.

export const adminOptions: AdminJSOptions = {
  rootPath: ADMIN_PATH,
  componentLoader,
  branding: { companyName: 'Oremus Admin', withMadeWithLove: false, logo: false, favicon: '/assets/brand/favicon.svg', theme: adminTheme },
  // Rounded controls and cards, same shapes as the site (see public/assets/admin.css).
  assets: { styles: ['/assets/admin.css'] },
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
          monitoring: 'Monitoring', servers: '· Servers', requests: '· Requests', exceptions: '· Exceptions', database: '· Database',
          cache: '· Cache', queues: '· Queues & jobs', outgoing: '· Outgoing HTTP', usage: '· Usage'
        },
        labels: {
          ModerationCase: 'Moderation cases', Report: 'Reports', ModerationPolicy: 'Policies', ModerationScan: 'Scans', Call: 'Calls', AuditLog: 'Audit log',
          AdCampaign: 'Ad campaigns', AdAccount: 'Ad wallets', LedgerEntry: 'Ledger', PaymentOrder: 'Payments',
          User: 'Members', Post: 'Posts', Comment: 'Comments', Story: 'Stories', Group: 'Groups'
        },
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
