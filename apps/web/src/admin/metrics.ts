import { redis } from '../config/database.js';
import { logger } from '../config/logger.js';
import { queueHealth } from '../jobs/queues.js';
import { Comment, Interaction, ModerationCase, Post, Report, User } from '../models/index.js';

const CACHE_KEY = 'cache:admin:metrics';
const CACHE_SECONDS = 60;
const DAY = 86_400_000;

const startOfToday = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; };

async function collect() {
  const today = startOfToday(), week = new Date(Date.now() - 7 * DAY);
  const [activeToday, newThisWeek, total, restricted, postsToday, commentsToday, openCases, openReports, openAppeals, removedThisWeek, queues] = await Promise.all([
    Interaction.distinct('userId', { createdAt: { $gte: today } }).then((ids: unknown[]) => ids.length),
    User.countDocuments({ createdAt: { $gte: week }, deletedAt: null }),
    User.countDocuments({ deletedAt: null }),
    User.countDocuments({ status: { $in: ['suspended', 'banned'] }, deletedAt: null }),
    Post.countDocuments({ createdAt: { $gte: today }, deletedAt: null }),
    Comment.countDocuments({ createdAt: { $gte: today }, deletedAt: null }),
    ModerationCase.countDocuments({ status: 'open' }),
    Report.countDocuments({ status: 'open' }),
    ModerationCase.countDocuments({ 'appeal.status': 'pending' }),
    ModerationCase.countDocuments({ autoAction: 'removed', createdAt: { $gte: week } }),
    // A Redis problem should not take the whole dashboard down with it.
    queueHealth().catch((error) => { logger.warn({ error }, 'Queue health unavailable'); return {}; })
  ]);
  return {
    generatedAt: new Date().toISOString(),
    users: { activeToday, newThisWeek, total, restricted },
    content: { postsToday, commentsToday },
    moderation: { openCases, openReports, openAppeals, removedThisWeek },
    ads: { pendingReview: 0, active: 0, topUps: 0, spend: 0 },
    calls: { total: 0, answered: 0, failed: 0 },
    queues
  };
}

export async function adminMetrics() {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const metrics = await collect();
  await redis.set(CACHE_KEY, JSON.stringify(metrics), { EX: CACHE_SECONDS });
  return metrics;
}
