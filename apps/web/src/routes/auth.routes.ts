import { Router } from 'express';
import * as controller from '../controllers/auth.controller.js';
import { asyncHandler } from '../utils/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { requireAuth } from '../middleware/auth.js';

export const authRoutes = Router();
authRoutes.post('/register', rateLimit('auth', 10, 900), asyncHandler(controller.register));
authRoutes.post('/login', rateLimit('auth', 10, 900), asyncHandler(controller.login));
authRoutes.post('/refresh', rateLimit('refresh', 30, 900), asyncHandler(controller.refresh));
authRoutes.post('/logout', requireAuth, asyncHandler(controller.logout));
authRoutes.post('/password/reset-request', rateLimit('reset', 5, 3600), asyncHandler(controller.requestReset));
authRoutes.post('/password/reset-confirm', rateLimit('reset-confirm', 8, 3600), asyncHandler(controller.confirmReset));

