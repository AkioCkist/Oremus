import { Router } from 'express';
import * as page from '../controllers/page.controller.js';
import { optionalAuth, requirePageAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export const pageRoutes = Router();
pageRoutes.use(optionalAuth);
pageRoutes.use(asyncHandler(page.navState));
// Signed-in people answer the interest survey (or skip it) before using the app.
pageRoutes.use(page.onboardingGate);
pageRoutes.get('/login', page.loginPage);
pageRoutes.get('/register', page.registerPage);
pageRoutes.get('/reset-password', page.resetPage);
pageRoutes.get('/', requirePageAuth, asyncHandler(page.home));
pageRoutes.get('/profile/:username', asyncHandler(page.profile));
pageRoutes.get('/posts/:postId', asyncHandler(page.post));
pageRoutes.get('/groups', asyncHandler(page.groups));
pageRoutes.get('/groups/:slug', asyncHandler(page.group));
pageRoutes.get('/g/:groupId', asyncHandler(page.groupById));
pageRoutes.get('/stories', requirePageAuth, asyncHandler(page.stories));
pageRoutes.get('/stories/archive', requirePageAuth, asyncHandler(page.storyArchive));
pageRoutes.get('/stories/:username', requirePageAuth, asyncHandler(page.stories));
pageRoutes.get('/messages', requirePageAuth, asyncHandler(page.messages));
pageRoutes.get('/messages/:conversationId', requirePageAuth, asyncHandler(page.conversation));
pageRoutes.get('/notifications', requirePageAuth, asyncHandler(page.notifications));
pageRoutes.get('/search', requirePageAuth, asyncHandler(page.search));
pageRoutes.get('/onboarding', requirePageAuth, page.onboarding);
pageRoutes.get('/discover', requirePageAuth, asyncHandler(page.discover));
pageRoutes.get('/settings', requirePageAuth, page.settings);
