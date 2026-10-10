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

// Content hash appended to /assets URLs so browsers never keep a stale build.
function assetVersion(): string {
  const hash = crypto.createHash('sha1');
  for (const file of ['styles.css', 'app.js']) {
    try { hash.update(fs.readFileSync(path.resolve(process.cwd(), 'public/assets', file))); } catch { hash.update(String(Date.now())); }
  }
  return hash.digest('hex').slice(0, 10);
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.resolve(process.cwd(), 'src/views'));
  Object.assign(app.locals, viewHelpers, { assetVersion: assetVersion() });
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://cdn.socket.io'], imgSrc: ["'self'", 'data:', 'blob:', 'https:'], mediaSrc: ["'self'", 'blob:'], connectSrc: ["'self'", 'ws:', 'wss:'], styleSrc: ["'self'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'] } } }));
  app.use(compression());
  app.use(pinoHttp({ logger }));
  app.use(requestContext);
  app.use(cookieParser());
  // Display preference (light | dark | system) is a per-device cookie so pages render in the right theme without a flash.
  app.use((req, res, next) => { const theme = req.cookies?.theme; res.locals.theme = ['light', 'dark', 'system'].includes(theme) ? theme : 'system'; next(); });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use('/assets', express.static(path.resolve(process.cwd(), 'public/assets'), { maxAge: env.NODE_ENV === 'production' ? '7d' : 0 }));
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads'), { maxAge: '1d', fallthrough: false }));
  app.use(csrfToken);
  app.get('/health', asyncHandler(async (_req, res) => {
    const infrastructure = await checkInfrastructure();
    res.json({ ok: true, service: 'oremus-web', infrastructure });
  }));
  app.use(requireCsrf);
  app.use('/auth', authRoutes);
  app.use('/api', apiRoutes);
  app.use(pageRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

