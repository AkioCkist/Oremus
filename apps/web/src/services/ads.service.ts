import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { redis } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AdAccount, AdCampaign, AdPreference, AdStatDaily, LedgerEntry, User } from '../models/index.js';
import { interestOption, INTEREST_KEYS } from '../shared/interests.js';
import { AppError } from '../utils/errors.js';
import { audit } from './audit.service.js';
import { assertTextAllowed, requestScan } from './moderation.service.js';
import { notifySystem } from './notification.service.js';
import { feedExclusions } from './social.service.js';

/** One sponsored card after every this many organic posts. */
export const AD_EVERY = 8;
const FREQUENCY_CAP_PER_DAY = 3;
const TOKEN_TTL_SECONDS = 6 * 3600;
const ELIGIBLE_CACHE_KEY = 'cache:ads:eligible';
const ELIGIBLE_CACHE_SECONDS = 60;
const INTEREST_BOOST = 1.5;
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- Wallet ---------- */

export async function getAccount(userId: string) {
  return AdAccount.findOneAndUpdate({ userId }, { $setOnInsert: { userId, balance: 0 } }, { upsert: true, new: true });
}

type LedgerInput = { userId: string; type: 'topup' | 'spend' | 'refund' | 'adjustment'; amount: number; key: string; refType?: string; refId?: unknown; note?: string; actorId?: string };

/**
 * Moves money in a wallet. The ledger is the record of truth and the balance a running total of it.
 * MongoDB here has no transactions, so the entry is written first: its unique key makes retries harmless, and
 * reconcileAccounts repairs the balance if the process dies between the two writes.
 * Returns false if the wallet cannot cover a debit.
 */
export async function applyLedger(input: LedgerInput): Promise<boolean> {
  let entry;
  try {
    entry = await LedgerEntry.create({ userId: input.userId, type: input.type, amount: input.amount, idempotencyKey: input.key, refType: input.refType, refId: input.refId, note: input.note || '', actorId: input.actorId || null, balanceAfter: null });
  } catch (error: any) {
    if (error?.code === 11000) return true; // Already applied by an earlier attempt.
    throw error;
  }
  await getAccount(input.userId);
  const account = await AdAccount.findOneAndUpdate({ userId: input.userId, ...(input.amount < 0 ? { balance: { $gte: -input.amount } } : {}) }, { $inc: { balance: input.amount } }, { new: true });
  if (!account) { await entry.deleteOne(); return false; }
  entry.balanceAfter = account.balance;
  await entry.save();
  return true;
}

/** Repairs wallets left half-written by a crash: the ledger wins. */
export async function reconcileAccounts(): Promise<number> {
  const unfinished: any[] = await LedgerEntry.find({ balanceAfter: null, createdAt: { $lt: new Date(Date.now() - 5 * 60_000) } }).select('userId').limit(500).lean();
  const users = [...new Set(unfinished.map((row) => String(row.userId)))];
  for (const userId of users) {
    const [total] = await LedgerEntry.aggregate([{ $match: { userId: new mongoose.Types.ObjectId(userId) } }, { $group: { _id: null, balance: { $sum: '$amount' } } }]);
    const balance = total?.balance ?? 0;
    logger.warn({ userId, balance }, 'Reconciled ad wallet from its ledger');
    await AdAccount.updateOne({ userId }, { balance });
    await LedgerEntry.updateMany({ userId, balanceAfter: null }, { balanceAfter: balance });
  }
  return users.length;
}

/** A staff correction or refund. The reason is required because this moves money by hand. */
export async function adjustBalance(actorId: string, userId: string, amount: number, reason: string) {
  if (!Number.isInteger(amount) || amount === 0) throw new AppError(422, 'Enter a whole, non-zero amount in VND.', 'VALIDATION_ERROR');
  const applied = await applyLedger({ userId, type: amount > 0 ? 'refund' : 'adjustment', amount, key: `manual:${crypto.randomUUID()}`, note: reason, actorId });
  if (!applied) throw new AppError(409, 'The wallet does not have that much.', 'INSUFFICIENT_BALANCE');
  await audit('ads.adjust', actorId, 'User', userId, { amount, reason });
}

/* ---------- Campaigns ---------- */

export type CampaignInput = { name: string; headline: string; body: string; ctaLabel: string; ctaUrl: string; topics: string[]; dailyBudget: number; totalBudget: number; cpm: number; startAt?: Date | null; endAt?: Date | null };

export async function listCampaigns(userId: string) {
  return AdCampaign.find({ advertiserId: userId }).sort({ createdAt: -1 }).limit(100).lean();
}

export async function createCampaign(userId: string, input: CampaignInput, file?: Express.Multer.File) {
  assertTextAllowed(input.name, input.headline, input.body);
  const account = await getAccount(userId);
  if (account.balance <= 0) throw new AppError(422, 'Top up your ad wallet before submitting a campaign.', 'INSUFFICIENT_BALANCE');
  const campaign = await AdCampaign.create({ ...input, advertiserId: userId, mediaUrl: file ? `/uploads/${file.filename}` : '', status: 'pending_review' });
  await requestScan('AdCampaign', campaign.id);
  return campaign;
}

async function ownedCampaign(userId: string, campaignId: string) {
  if (!mongoose.isValidObjectId(campaignId)) throw new AppError(404, 'Campaign not found.', 'NOT_FOUND');
  const campaign = await AdCampaign.findOne({ _id: campaignId, advertiserId: userId });
  if (!campaign) throw new AppError(404, 'Campaign not found.', 'NOT_FOUND');
  return campaign;
}

/** Changing what people will see sends the campaign back through review. */
export async function updateCampaign(userId: string, campaignId: string, input: CampaignInput, file?: Express.Multer.File) {
  const campaign = await ownedCampaign(userId, campaignId);
  if (campaign.status === 'ended') throw new AppError(409, 'This campaign has ended.', 'CAMPAIGN_ENDED');
  assertTextAllowed(input.name, input.headline, input.body);
  campaign.set({ ...input, status: 'pending_review', rejectionReason: '', ...(file ? { mediaUrl: `/uploads/${file.filename}` } : {}) });
  await campaign.save();
  await invalidateEligibleAds();
  await requestScan('AdCampaign', campaign.id);
  return campaign;
}

export async function setCampaignRunning(userId: string, campaignId: string, running: boolean) {
  const campaign = await ownedCampaign(userId, campaignId);
  const allowed = running ? ['paused', 'exhausted'] : ['active'];
  if (!allowed.includes(campaign.status)) throw new AppError(409, 'This campaign cannot be changed right now.', 'CAMPAIGN_STATE');
  if (running && (await getAccount(userId)).balance <= 0) throw new AppError(422, 'Top up your ad wallet first.', 'INSUFFICIENT_BALANCE');
  campaign.status = running ? 'active' : 'paused';
  await campaign.save();
  await invalidateEligibleAds();
  return campaign;
}

export async function endCampaign(userId: string, campaignId: string) {
  const campaign = await ownedCampaign(userId, campaignId);
  campaign.status = 'ended';
  await campaign.save();
  await invalidateEligibleAds();
}

export async function reviewCampaign(actorId: string, campaignId: string, approve: boolean, reason: string) {
  const campaign = await AdCampaign.findOneAndUpdate({ _id: campaignId, status: 'pending_review' }, { status: approve ? 'active' : 'rejected', rejectionReason: approve ? '' : reason, reviewedBy: actorId, reviewedAt: new Date() }, { new: true });
  if (!campaign) throw new AppError(409, 'This campaign is not waiting for review.', 'CAMPAIGN_STATE');
  await invalidateEligibleAds();
  await notifySystem({ recipientId: String(campaign.advertiserId), type: 'ad_status', entityType: 'AdCampaign', entityId: campaign.id, text: approve ? `approved your campaign "${campaign.name}". It is running now.`.slice(0, 180) : `did not approve your campaign "${campaign.name}": ${reason}`.slice(0, 180) });
  await audit(approve ? 'ads.approve' : 'ads.reject', actorId, 'AdCampaign', campaignId, { reason });
  return campaign;
}

/* ---------- What each person allows ---------- */

export async function getPreferences(userId: string): Promise<any> {
  return (await AdPreference.findOne({ userId }).lean()) ?? { userId, blockedAdvertiserIds: [], blockedTopics: [], hiddenCampaignIds: [], personalized: true };
}

const LIST_LIMIT = 500;

export async function updatePreferences(userId: string, action: string, value: unknown) {
  const add = (field: string, item: unknown) => AdPreference.updateOne({ userId }, { $addToSet: { [field]: item } }, { upsert: true });
  const remove = (field: string, item: unknown) => AdPreference.updateOne({ userId }, { $pull: { [field]: item } });
  const id = String(value);
  const assertId = () => { if (!mongoose.isValidObjectId(id)) throw new AppError(422, 'That was not recognised.', 'VALIDATION_ERROR'); };
  const assertTopic = () => { if (!(INTEREST_KEYS as readonly string[]).includes(id)) throw new AppError(422, 'Unknown topic.', 'VALIDATION_ERROR'); };
  const current = await getPreferences(userId);
  if ([current.blockedAdvertiserIds, current.blockedTopics, current.hiddenCampaignIds].some((list: unknown[]) => list.length >= LIST_LIMIT) && action.startsWith('block')) throw new AppError(422, 'You have reached the limit for this list.', 'LIMIT_REACHED');
  switch (action) {
    case 'hide_campaign': assertId(); await add('hiddenCampaignIds', id); await countStat(id, { hides: 1 }); break;
    case 'block_advertiser': assertId(); await add('blockedAdvertiserIds', id); break;
    case 'unblock_advertiser': assertId(); await remove('blockedAdvertiserIds', id); break;
    case 'block_topic': assertTopic(); await add('blockedTopics', id); break;
    case 'unblock_topic': assertTopic(); await remove('blockedTopics', id); break;
    case 'set_personalized': await AdPreference.updateOne({ userId }, { personalized: value === true || value === 'true' }, { upsert: true }); break;
    default: throw new AppError(422, 'Unknown action.', 'VALIDATION_ERROR');
  }
}

/** Settings page data: names for the blocked lists. */
export async function preferencesForSettings(userId: string) {
  const preferences = await getPreferences(userId);
  const advertisers = preferences.blockedAdvertiserIds.length ? await User.find({ _id: { $in: preferences.blockedAdvertiserIds } }).select('displayName').lean() : [];
  return {
    personalized: preferences.personalized !== false,
    blockedAdvertisers: advertisers.map((person: any) => ({ id: String(person._id), name: person.displayName })),
    blockedTopics: preferences.blockedTopics.map((key: string) => ({ key, label: interestOption(key)?.label || key }))
  };
}

/* ---------- Serving ---------- */

const tokenKey = () => env.AD_TOKEN_SECRET || crypto.createHash('sha256').update(`ads:${env.JWT_ACCESS_SECRET}`).digest('hex');

export function signAdToken(campaignId: string, userId: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ c: campaignId, u: userId, n: crypto.randomBytes(6).toString('base64url'), e: Math.floor(now / 1000) + TOKEN_TTL_SECONDS })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', tokenKey()).update(body).digest('base64url')}`;
}

export function verifyAdToken(token: string, now = Date.now()): { c: string; u: string; n: string; e: number } | null {
  const [body, signature] = String(token).split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', tokenKey()).update(body).digest();
  const given = Buffer.from(signature, 'base64url');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    return claims.e * 1000 > now ? claims : null;
  } catch { return null; }
}

export async function invalidateEligibleAds(): Promise<void> {
  await redis.del(ELIGIBLE_CACHE_KEY);
}

async function eligibleCampaigns(): Promise<any[]> {
  const cached = await redis.get(ELIGIBLE_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const now = new Date();
  const rows: any[] = await AdCampaign.find({ status: 'active', $and: [{ $or: [{ startAt: null }, { startAt: { $lte: now } }] }, { $or: [{ endAt: null }, { endAt: { $gt: now } }] }] })
    .populate('advertiserId', 'username displayName profile.avatarUrl deletedAt status')
    .select('advertiserId name headline body mediaUrl ctaLabel ctaUrl topics cpm dailyBudget totalBudget spent').limit(500).lean();
  const usable = rows.filter((row) => row.advertiserId && !row.advertiserId.deletedAt && row.advertiserId.status !== 'banned');
  await redis.set(ELIGIBLE_CACHE_KEY, JSON.stringify(usable), { EX: ELIGIBLE_CACHE_SECONDS });
  return usable;
}

const dayKey = (campaignId: string) => `ads:day:${today()}:${campaignId}`;
const frequencyKey = (userId: string, campaignId: string) => `ads:freq:${today()}:${userId}:${campaignId}`;

/** Pure ranking and filtering, separated so the rules can be tested without Redis or MongoDB. */
export function pickCampaigns(candidates: any[], context: { userId: string; excluded: Set<string>; preferences: any; interests: string[]; capped: Set<string>; spentToday: Map<string, number>; count: number; random?: () => number }) {
  const { preferences, random = Math.random } = context;
  const hidden = new Set((preferences.hiddenCampaignIds || []).map(String));
  const blockedAdvertisers = new Set((preferences.blockedAdvertiserIds || []).map(String));
  const blockedTopics = new Set(preferences.blockedTopics || []);
  const personalized = preferences.personalized !== false;
  const interests = new Set(personalized ? context.interests : []);
  return candidates
    .filter((ad) => {
      const id = String(ad._id), advertiser = String(ad.advertiserId._id);
      if (advertiser === context.userId || context.excluded.has(advertiser) || blockedAdvertisers.has(advertiser)) return false;
      if (hidden.has(id) || context.capped.has(id)) return false;
      if (ad.topics.some((topic: string) => blockedTopics.has(topic))) return false;
      if ((ad.spent ?? 0) >= ad.totalBudget || (context.spentToday.get(id) ?? 0) >= ad.dailyBudget) return false;
      return true;
    })
    .map((ad) => {
      const matched = ad.topics.filter((topic: string) => interests.has(topic));
      // Random spread, so a slightly higher bid does not take every slot.
      const weight = ad.cpm * (matched.length ? INTEREST_BOOST : 1) * (0.5 + random());
      return { ad, matched, weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, context.count);
}

const whyShown = (advertiser: string, matched: string[]) => (matched.length
  ? `${advertiser} wants to reach people interested in ${interestOption(matched[0]!)?.label ?? matched[0]}, which you chose in your interests.`
  : `${advertiser} is advertising to everyone on Oremus. Nothing about you was used.`);

/** Mixes sponsored cards into a feed page. Paging counts organic posts only, so ads can never shift it. */
export async function withAds<T>(posts: T[], viewerId: string, offset: number, interests: string[] = []): Promise<Array<T | any>> {
  const slots: number[] = [];
  posts.forEach((_post, index) => { if ((offset + index + 1) % AD_EVERY === 0) slots.push(index); });
  if (!slots.length) return posts;
  // Ads must never break the feed: any failure just means a page without them.
  try {
    const candidates = await eligibleCampaigns();
    if (!candidates.length) return posts;
    const [excluded, preferences] = await Promise.all([feedExclusions(viewerId), getPreferences(viewerId)]);
    const ids = candidates.map((ad) => String(ad._id));
    const [frequency, spent] = await Promise.all([redis.mGet(ids.map((id) => frequencyKey(viewerId, id))), redis.mGet(ids.map(dayKey))]);
    const capped = new Set(ids.filter((_id, index) => Number(frequency[index] ?? 0) >= FREQUENCY_CAP_PER_DAY));
    const spentToday = new Map(ids.map((id, index) => [id, Number(spent[index] ?? 0)]));
    const picked = pickCampaigns(candidates, { userId: viewerId, excluded: new Set(excluded), preferences, interests, capped, spentToday, count: slots.length });
    const merged: Array<T | any> = [];
    posts.forEach((post, index) => {
      merged.push(post);
      const position = slots.indexOf(index);
      const pick = position === -1 ? undefined : picked[position];
      if (pick) merged.push({ isAd: true, ...pick.ad, token: signAdToken(String(pick.ad._id), viewerId), why: whyShown(pick.ad.advertiserId.displayName, pick.matched), topicLabels: pick.ad.topics.map((key: string) => ({ key, label: interestOption(key)?.label || key })) });
    });
    return merged;
  } catch (error) {
    logger.error({ error }, 'Could not load ads for the feed');
    return posts;
  }
}

/* ---------- Measuring and billing ---------- */

const PENDING_KEY = 'ads:pending';

async function countStat(campaignId: string, inc: Record<string, number>) {
  await AdStatDaily.updateOne({ campaignId, date: today() }, { $inc: inc }, { upsert: true });
}

/** Counts a view once per rendered card. Spend is settled in batches by settleAdSpend, not on this request. */
export async function recordImpression(token: string, viewerId: string): Promise<boolean> {
  const claims = verifyAdToken(token);
  if (!claims || claims.u !== viewerId) throw new AppError(400, 'Invalid ad token.', 'AD_TOKEN_INVALID');
  const first = await redis.set(`ads:seen:${claims.n}`, '1', { NX: true, EX: TOKEN_TTL_SECONDS });
  if (!first) return false;
  const campaign: any = await AdCampaign.findById(claims.c).select('cpm').lean();
  if (!campaign) return false;
  await Promise.all([
    redis.hIncrBy(PENDING_KEY, claims.c, 1),
    redis.incrByFloat(dayKey(claims.c), campaign.cpm / 1000),
    redis.expire(dayKey(claims.c), 2 * 86_400),
    redis.incr(frequencyKey(viewerId, claims.c)),
    redis.expire(frequencyKey(viewerId, claims.c), 2 * 86_400)
  ]);
  return true;
}

/** Destination of a click. It comes from the reviewed campaign, never from the request, so this cannot redirect elsewhere. */
export async function recordClick(token: string): Promise<string | null> {
  const claims = verifyAdToken(token);
  if (!claims) return null;
  const campaign: any = await AdCampaign.findById(claims.c).select('ctaUrl').lean();
  if (!campaign?.ctaUrl || !campaign.ctaUrl.startsWith('https://')) return null;
  const first = await redis.set(`ads:clicked:${claims.n}`, '1', { NX: true, EX: TOKEN_TTL_SECONDS });
  if (first) await Promise.all([countStat(claims.c, { clicks: 1 }), AdCampaign.updateOne({ _id: claims.c }, { $inc: { clicks: 1 } })]);
  return campaign.ctaUrl;
}

/**
 * Turns counted views into charges. A campaign is only ever charged up to its total budget and wallet balance,
 * so views served in the moments before it stops are at the platform's expense, not the advertiser's.
 */
export async function settleAdSpend(): Promise<number> {
  const batch = `${PENDING_KEY}:${crypto.randomUUID()}`;
  try { await redis.rename(PENDING_KEY, batch); }
  catch { return 0; } // Nothing was counted since the last run.
  const counts = await redis.hGetAll(batch);
  let settled = 0;
  for (const [campaignId, raw] of Object.entries(counts)) {
    const views = Number(raw);
    const campaign = await AdCampaign.findByIdAndUpdate(campaignId, { $inc: { impressions: views } }, { new: true });
    if (!campaign) continue;
    const owed = Math.floor(campaign.impressions * campaign.cpm / 1000) - campaign.spent;
    const remaining = campaign.totalBudget - campaign.spent;
    const account = await getAccount(String(campaign.advertiserId));
    const charge = Math.max(0, Math.min(owed, remaining, account.balance));
    if (charge > 0) {
      const applied = await applyLedger({ userId: String(campaign.advertiserId), type: 'spend', amount: -charge, key: `spend:${campaignId}:${campaign.impressions}`, refType: 'AdCampaign', refId: campaignId, note: campaign.name });
      if (applied) {
        await AdCampaign.updateOne({ _id: campaignId }, { $inc: { spent: charge } });
        campaign.spent += charge; account.balance -= charge;
      }
    }
    await countStat(campaignId, { impressions: views, spend: Math.max(charge, 0) });
    settled += views;
    if (campaign.status === 'active' && (campaign.spent >= campaign.totalBudget || account.balance <= 0)) {
      const outOfBudget = campaign.spent >= campaign.totalBudget;
      await AdCampaign.updateOne({ _id: campaignId, status: 'active' }, { status: outOfBudget ? 'ended' : 'exhausted' });
      await notifySystem({ recipientId: String(campaign.advertiserId), type: 'ad_status', entityType: 'AdCampaign', entityId: campaignId, text: outOfBudget ? `finished your campaign "${campaign.name}": it reached its budget.`.slice(0, 180) : `paused your campaign "${campaign.name}": your ad wallet is empty.`.slice(0, 180) });
      await invalidateEligibleAds();
    }
  }
  await redis.del(batch);
  return settled;
}

export async function campaignStats(userId: string, campaignId: string) {
  await ownedCampaign(userId, campaignId);
  return AdStatDaily.find({ campaignId }).sort({ date: -1 }).limit(30).lean();
}
