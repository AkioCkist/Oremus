import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { redis } from '../config/database.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/errors.js';

type AccessClaims = { sub: string; jti: string; type: 'access' };

async function resolveUser(req: Parameters<RequestHandler>[0]): Promise<void> {
  const token = req.cookies?.access_token;
  if (!token) return;
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;
    if (claims.type !== 'access' || await redis.exists(`deny:${claims.jti}`)) return;
    const user = await User.findOne({ _id: claims.sub, deletedAt: null });
    if (user) { req.user = user; req.auth = { sub: claims.sub, jti: claims.jti }; }
  } catch { /* Expired/invalid cookies behave as anonymous. */ }
}

export const optionalAuth = asyncHandler(async (req, res, next) => {
  await resolveUser(req);
  res.locals.currentUser = req.user?.toObject() ?? null;
  next();
});

export const requireAuth = asyncHandler(async (req, _res, next) => {
  if (!req.user) await resolveUser(req);
  if (!req.user) throw new AppError(401, 'Please sign in to continue.', 'AUTH_REQUIRED');
  next();
});

export const requirePageAuth = asyncHandler(async (req, res, next) => {
  if (!req.user) await resolveUser(req);
  if (!req.user) {
    res.redirect(302, '/login');
    return;
  }
  next();
});

