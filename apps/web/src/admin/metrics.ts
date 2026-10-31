import { redis } from '../config/database.js';
import { logger } from '../config/logger.js';
import { queueHealth } from '../jobs/queues.js';
import { AdCampaign, Call, Comment, Interaction, LedgerEntry, ModerationCase, Post, Report, User } from '../models/index.js';

const CACHE_KEY = 'cache:admin:metrics';
const CACHE_SECONDS = 60;
const DAY = 86_400_000;

const startOfToday = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; };

async function collect() {
  const today = startOfToday(), week = new Date(Date.now() - 7 * DAY);
  const [activeToday, newThisWeek, total, restricted, postsToday, commentsToday, openCases, openReports, openAppeals, removedThisWeek, pendingReview, activeAds, money, callRows, queues] = await Promise.all([
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
    AdCampaign.countDocuments({ status: 'pending_review' }),
    AdCampaign.countDocuments({ status: 'active' }),
    LedgerEntry.aggregate([{ $match: { type: { $in: ['topup', 'spend'] }, createdAt: { $gte: new Date(Date.now() - 30 * DAY) } } }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
    Call.aggregate([{ $match: { createdAt: { $gte: week } } }, { $group: { _id: '$status', total: { $sum: 1 } } }]),
    // A Redis problem should not take the whole dashboard down with it.
    queueHealth().catch((error) => { logger.warn({ error }, 'Queue health unavailable'); return {}; })
  ]);
  const callCount = (status: string) => callRows.find((row: any) => row._id === status)?.total ?? 0;
  return {
    generatedAt: new Date().toISOString(),
    users: { activeToday, newThisWeek, total, restricted },
    content: { postsToday, commentsToday },
    moderation: { openCases, openReports, openAppeals, removedThisWeek },
    ads: { pendingReview, active: activeAds, topUps: money.find((row: any) => row._id === 'topup')?.total ?? 0, spend: Math.abs(money.find((row: any) => row._id === 'spend')?.total ?? 0) },
    calls: { total: callRows.reduce((sum: number, row: any) => sum + row.total, 0), answered: callCount('ended') + callCount('accepted'), failed: callCount('failed') },
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
