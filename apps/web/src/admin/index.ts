import { buildRouter } from '@adminjs/express';
import { Database, Resource } from '@adminjs/mongoose';
import AdminJS, { type AdminJSOptions } from 'adminjs';
import type { RequestHandler } from 'express';
import { ADMIN_PATH } from './mount.js';
import { componentLoader, components } from './components.js';
import { adminMetrics } from './metrics.js';
import { adminResources } from './resources.js';

AdminJS.registerAdapter({ Database, Resource });

export const adminOptions: AdminJSOptions = {
  rootPath: ADMIN_PATH,
  componentLoader,
  branding: { companyName: 'Oremus Admin', withMadeWithLove: false, logo: false },
  dashboard: { component: components.Dashboard, handler: adminMetrics },
  resources: adminResources,
  // Staff land on the site's own login; there is no second password for the panel.
  loginPath: '/login',
  logoutPath: '/auth/logout'
};

export function buildAdminRouter(): RequestHandler {
  return buildRouter(new AdminJS(adminOptions));
}
