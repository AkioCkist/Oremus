import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { redis } from '../config/database.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/errors.js';
import { clearSessionCookies, restoreSession } from '../services/auth.service.js';

type AccessClaims = { sub: string; jti: string; type: 'access' };

async function resolveUser(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]): Promise<void> {
  const token = req.cookies?.access_token;
  if (token) {
    try {
      const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;
      if (claims.type === 'access' && !(await redis.exists(`deny:${claims.jti}`))) {
        const user = await User.findOne({ _id: claims.sub, deletedAt: null });
        if (user) { req.user = user; req.auth = { sub: claims.sub, jti: claims.jti }; return; }
      }
    } catch { /* A valid refresh token may restore the session below. */ }
  }
  if (!req.cookies?.refresh_token) return;
  try {
    const session = await restoreSession(req.cookies.refresh_token, res, { ip: req.ip, userAgent: req.get('user-agent') });
    req.user = session.user;
    req.auth = { sub: session.user.id, jti: session.jti };
  } catch {
    clearSessionCookies(res);
  }
}

export const optionalAuth = asyncHandler(async (req, res, next) => {
  await resolveUser(req, res);
  res.locals.currentUser = req.user?.toObject() ?? null;
  next();
});

export const requireAuth = asyncHandler(async (req, res, next) => {
  if (!req.user) await resolveUser(req, res);
  if (!req.user) throw new AppError(401, 'Please sign in to continue.', 'AUTH_REQUIRED');
  next();
});

export const requirePageAuth = asyncHandler(async (req, res, next) => {
  if (!req.user) await resolveUser(req, res);
  if (!req.user) {
    res.redirect(302, '/login');
    return;
  }
  next();
});

