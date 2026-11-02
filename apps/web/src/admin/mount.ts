import type { NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { requireRole } from '../middleware/auth.js';
import { quarantinePath } from '../moderation/quarantine.js';
import { AppError } from '../utils/errors.js';

export const ADMIN_PATH = '/admin';

/**
 * AdminJS is a prebuilt React app that needs inline scripts and styles, so it gets its own CSP.
 * The site-wide policy in app.ts stays strict, and nothing but staff ever reaches this one.
 */
export const adminHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null
    }
  }
});

/**
 * The AdminJS client cannot send our CSRF header, so its writes are checked by origin instead.
 * Browsers always send Origin on POST and cannot be scripted to forge it.
 */
export function sameOriginWrites(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD') {
    // One-click record actions (Approve, Reinstate...) reach the API as GET, so API reads must come from the panel itself
    // (or be typed into the address bar), never from a link or image on another site.
    if (String(req.path || '').startsWith('/api/') && !fromThisSite(req)) return next(new AppError(403, 'Cross-site admin requests are not allowed.', 'CSRF_INVALID'));
    return next();
  }
  const origin = req.get('origin');
  const sameHost = origin ? new URL(origin).host === req.get('host') : false;
  if (!origin || !(env.APP_ORIGIN.includes(origin) || sameHost)) return next(new AppError(403, 'Cross-origin admin requests are not allowed.', 'CSRF_INVALID'));
  next();
}

/** Fetch Metadata where the browser sends it (all current ones do); otherwise the Referer must be this host. */
function fromThisSite(req: Request): boolean {
  const site = req.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  const referer = req.get('referer');
  try { return Boolean(referer) && new URL(referer!).host === req.get('host'); } catch { return false; }
}

/** AdminJS reads the signed-in admin from req.session; our JWT session is the only login, so it is filled in from there. */
function adminSession(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user!;
  (req as any).session = { adminUser: { id: user.id, email: user.email, title: user.displayName, role: user.role, avatarUrl: user.profile?.avatarUrl || undefined } };
  next();
}

let routerPromise: Promise<RequestHandler> | undefined;
/** AdminJS is heavy and only staff need it, so it is loaded on first use (and once at startup by server.ts). */
export function loadAdminRouter(): Promise<RequestHandler> {
  routerPromise ??= import('./index.js').then(({ buildAdminRouter }) => buildAdminRouter()).catch((error) => {
    routerPromise = undefined;
    logger.error({ error }, 'Admin panel failed to load');
    throw error;
  });
  return routerPromise;
}

const adminRouter: RequestHandler = (req, res, next) => {
  loadAdminRouter().then((router) => router(req, res, next)).catch(next);
};

/** Lets reviewers see media that has already been taken out of public reach. Inline images and video only, by exact file name. */
const quarantinedMedia: RequestHandler = (req, res, next) => {
  const match = /^\/quarantine\/([\w.-]+)$/.exec(req.path);
  if (!match || req.method !== 'GET') return next();
  res.sendFile(quarantinePath(match[1]!), { dotfiles: 'allow' }, (error) => { if (error && !res.headersSent) next(new AppError(404, 'File not found.', 'NOT_FOUND')); });
};

export const adminEntry: RequestHandler[] = [requireRole('moderator', 'admin'), sameOriginWrites, quarantinedMedia, adminSession, adminRouter];
