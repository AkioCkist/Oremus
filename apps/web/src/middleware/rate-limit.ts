import type { RequestHandler } from 'express';
import { redis } from '../config/database.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/errors.js';

export function rateLimit(scope: string, limit: number, windowSeconds: number): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const identity = req.user?.id || req.ip || 'unknown';
    const key = `rate:${scope}:${identity}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    res.setHeader('RateLimit-Limit', limit);
    res.setHeader('RateLimit-Remaining', Math.max(limit - count, 0));
    if (count > limit) throw new AppError(429, 'Too many requests. Please wait and try again.', 'RATE_LIMITED');
    next();
  });
}

