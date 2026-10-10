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

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.resolve(process.cwd(), 'src/views'));
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://cdn.socket.io'], imgSrc: ["'self'", 'data:', 'https:'], connectSrc: ["'self'", 'ws:', 'wss:'], styleSrc: ["'self'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'] } } }));
  app.use(compression());
  app.use(pinoHttp({ logger }));
  app.use(requestContext);
  app.use(cookieParser());
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

