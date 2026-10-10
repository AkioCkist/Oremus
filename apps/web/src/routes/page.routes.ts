import { Router } from 'express';
import * as page from '../controllers/page.controller.js';
import { optionalAuth, requirePageAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export const pageRoutes = Router();
pageRoutes.use(optionalAuth);
pageRoutes.get('/login', page.loginPage);
pageRoutes.get('/register', page.registerPage);
pageRoutes.get('/reset-password', page.resetPage);
pageRoutes.get('/', requirePageAuth, asyncHandler(page.home));
pageRoutes.get('/profile/:username', asyncHandler(page.profile));
pageRoutes.get('/posts/:postId', asyncHandler(page.post));
pageRoutes.get('/groups', asyncHandler(page.groups));
pageRoutes.get('/groups/:slug', asyncHandler(page.group));
pageRoutes.get('/messages', requirePageAuth, asyncHandler(page.messages));
pageRoutes.get('/messages/:conversationId', requirePageAuth, asyncHandler(page.conversation));
pageRoutes.get('/notifications', requirePageAuth, asyncHandler(page.notifications));
pageRoutes.get('/search', requirePageAuth, asyncHandler(page.search));
pageRoutes.get('/settings', requirePageAuth, page.settings);

