import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './config/logger.js';
import { env } from './config/env.js';
import { checkInfrastructure } from './config/database.js';
import { requestContext, csrfToken, requireCsrf } from './middleware/request.js';
import { errorHandler, notFound } from './middleware/error.js';
import { authRoutes } from './routes/auth.routes.js';
import { apiRoutes } from './routes/api.routes.js';
import { pageRoutes } from './routes/page.routes.js';
import { asyncHandler } from './utils/async-handler.js';
import { viewHelpers } from './utils/view-helpers.js';

// Built client bundles: served with ?v=<hash>, so they can be cached forever.
const BUNDLES = ['styles.css', 'app.js', 'image-worker.js'];

// Content hash appended to /assets URLs so browsers never keep a stale build.
function assetVersion(): string {
  const hash = crypto.createHash('sha1');
  for (const file of BUNDLES) {
    try { hash.update(fs.readFileSync(path.resolve(process.cwd(), 'public/assets', file))); } catch { hash.update(String(Date.now())); }
  }
  return hash.digest('hex').slice(0, 10);
}

export function assetCacheControl(filePath: string, production = env.NODE_ENV === 'production'): string {
  if (!production) return 'no-store';
  const bundle = BUNDLES.includes(path.basename(filePath));
  return bundle
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=604800';
}

function setAssetCacheHeaders(res: express.Response, filePath: string): void {
  res.setHeader('Cache-Control', assetCacheControl(filePath));
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.resolve(process.cwd(), 'src/views'));
  Object.assign(app.locals, viewHelpers, { assetVersion: assetVersion() });
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://cdn.socket.io'], imgSrc: ["'self'", 'data:', 'blob:', 'https:'], mediaSrc: ["'self'", 'blob:'], connectSrc: ["'self'", 'ws:', 'wss:'], styleSrc: ["'self'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null } } }));
  app.use(compression());
  app.use(pinoHttp({ logger }));
  app.use(requestContext);
  app.use(cookieParser());
  // Display preference (light | dark | system) is a per-device cookie so pages render in the right theme without a flash.
  app.use((req, res, next) => { const theme = req.cookies?.theme; res.locals.theme = ['light', 'dark', 'system'].includes(theme) ? theme : 'system'; next(); });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use('/assets', express.static(path.resolve(process.cwd(), 'public/assets'), { setHeaders: setAssetCacheHeaders }));
  // Upload filenames are UUIDs and are never overwritten, so they are safe to cache permanently.
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads'), { maxAge: '1y', immutable: true, fallthrough: false }));
  // The service worker must be revalidated on every load so a deploy rolls out promptly; it controls the whole site.
  app.get('/sw.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.resolve(process.cwd(), 'public/sw.js'));
  });
  // Every remaining response is dynamic, personalized, or contains a CSRF token.
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(csrfToken);
  app.get('/health', asyncHandler(async (_req, res) => {
    const infrastructure = await checkInfrastructure();
    res.json({ ok: true, service: 'oremus-web', infrastructure });
  }));
  // Precached by the service worker, so it is rendered without any session data.
  app.get('/offline', (_req, res) => res.render('offline', { title: 'Offline', csrfToken: '', currentUser: null }));
  app.use(requireCsrf);
  app.use('/auth', authRoutes);
  app.use('/api', apiRoutes);
  app.use(pageRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

