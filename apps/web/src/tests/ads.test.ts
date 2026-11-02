import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const kv = vi.hoisted(() => new Map<string, string>());
vi.mock('../config/database.js', () => ({
  checkInfrastructure: vi.fn(),
  redis: {
    get: vi.fn(async (key: string) => kv.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, options?: { NX?: boolean }) => { if (options?.NX && kv.has(key)) return null; kv.set(key, value); return 'OK'; }),
    del: vi.fn(async (key: string) => kv.delete(key)),
    mGet: vi.fn(async (keys: string[]) => keys.map((key) => kv.get(key) ?? null)),
    hIncrBy: vi.fn(), incrByFloat: vi.fn(), incr: vi.fn(), expire: vi.fn(), exists: vi.fn(async () => 0)
  }
}));

import { AdAccount, AdCampaign, LedgerEntry } from '../models/index.js';
import { applyLedger, isAdSlot, pickCampaigns, recordClick, recordImpression, signAdToken, verifyAdToken } from '../services/ads.service.js';
import { adCampaignSchema } from '../validators/index.js';

const id = (n: number) => String(n).padStart(24, 'a');
const ad = (n: number, fields: Record<string, unknown> = {}) => ({ _id: id(n), advertiserId: { _id: id(100 + n), displayName: `A${n}` }, topics: ['coffee'], cpm: 20_000, dailyBudget: 100, totalBudget: 1000, spent: 0, ...fields });
const context = (fields: Record<string, unknown> = {}) => ({ userId: id(1), excluded: new Set<string>(), preferences: {}, interests: [], capped: new Set<string>(), spentToday: new Map<string, number>(), count: 5, random: () => 0.5, ...fields });
const shown = (candidates: any[], fields: Record<string, unknown> = {}) => pickCampaigns(candidates, context(fields) as any).map((pick) => pick.ad._id);

describe('who sees which ad', () => {
  it('never shows a blocked advertiser', () => {
    expect(shown([ad(1), ad(2)], { preferences: { blockedAdvertiserIds: [id(101)] } })).toEqual([id(2)]);
  });

  it('never shows a blocked topic, even if the ad has others', () => {
    expect(shown([ad(1, { topics: ['coffee', 'travel'] }), ad(2, { topics: ['books'] })], { preferences: { blockedTopics: ['travel'] } })).toEqual([id(2)]);
  });

  it('never shows a hidden campaign', () => {
    expect(shown([ad(1), ad(2)], { preferences: { hiddenCampaignIds: [id(2)] } })).toEqual([id(1)]);
  });

  it('never shows ads across a block between people', () => {
    expect(shown([ad(1)], { excluded: new Set([id(101)]) })).toEqual([]);
  });

  it('shows advertisers one of their own running ads first, as a preview', () => {
    const picks = pickCampaigns([ad(2), ad(1), ad(3, { advertiserId: { _id: id(101), displayName: 'A1' } })], context({ userId: id(101) }) as any);
    expect(picks[0]).toMatchObject({ preview: true });
    expect(picks.filter((pick) => pick.preview)).toHaveLength(1);
    expect(picks.map((pick) => pick.ad._id)).toContain(id(2));
    expect(shown([ad(1, { spent: 1000 })], { userId: id(101) })).toEqual([]);
  });

  it('stops at the frequency cap and at either budget', () => {
    expect(shown([ad(1)], { capped: new Set([id(1)]) })).toEqual([]);
    expect(shown([ad(1, { spent: 1000 })])).toEqual([]);
    expect(shown([ad(1)], { spentToday: new Map([[id(1), 100]]) })).toEqual([]);
  });

  it('prefers matching interests only while personalization is on', () => {
    const candidates = [ad(1, { topics: ['books'] }), ad(2, { topics: ['coffee'] })];
    expect(shown(candidates, { interests: ['coffee'] })[0]).toBe(id(2));
    const off = pickCampaigns(candidates, context({ interests: ['coffee'], preferences: { personalized: false } }) as any);
    expect(off.every((pick) => pick.matched.length === 0)).toBe(true);
  });

  it('prefers topics from recent activity, and says so', () => {
    const candidates = [ad(1, { topics: ['books'] }), ad(2, { topics: ['gaming'] })];
    const [first] = pickCampaigns(candidates, context({ recent: ['gaming'] }) as any);
    expect(first).toMatchObject({ reason: 'activity', matched: ['gaming'] });
    expect(first!.ad._id).toBe(id(2));
    const off = pickCampaigns(candidates, context({ recent: ['gaming'], preferences: { personalized: false } }) as any);
    expect(off.every((pick) => pick.reason === null)).toBe(true);
  });

  it('only picks ads about the searched topic, even with personalization off', () => {
    const candidates = [ad(1, { topics: ['books'] }), ad(2, { topics: ['gaming', 'tech'] })];
    const picks = pickCampaigns(candidates, context({ onlyTopics: ['gaming'], preferences: { personalized: false } }) as any);
    expect(picks.map((pick) => [pick.ad._id, pick.reason])).toEqual([[id(2), 'search']]);
  });

  it('respects the number of open slots', () => {
    expect(shown([ad(1), ad(2), ad(3)], { count: 2 })).toHaveLength(2);
  });
});

describe('where ads go in the feed', () => {
  it('puts the first after the third post, then one every eight', () => {
    const slots = Array.from({ length: 30 }, (_, index) => index + 1).filter(isAdSlot);
    expect(slots).toEqual([3, 11, 19, 27]);
  });
});

describe('ad tokens', () => {
  it('round-trips', () => {
    expect(verifyAdToken(signAdToken(id(1), id(2)))).toMatchObject({ c: id(1), u: id(2) });
  });

  it('rejects tampering', () => {
    const [body, signature] = signAdToken(id(1), id(2)).split('.');
    const forged = Buffer.from(JSON.stringify({ c: id(9), u: id(2), n: 'x', e: 9_999_999_999 })).toString('base64url');
    expect(verifyAdToken(`${forged}.${signature}`)).toBeNull();
    expect(verifyAdToken(`${body}.${'x'.repeat(43)}`)).toBeNull();
    expect(verifyAdToken('nonsense')).toBeNull();
  });

  it('expires', () => {
    expect(verifyAdToken(signAdToken(id(1), id(2), Date.now() - 7 * 3600_000))).toBeNull();
  });
});

describe('impressions and clicks', () => {
  beforeEach(() => { vi.restoreAllMocks(); kv.clear(); });

  it("refuses someone else's token", async () => {
    await expect(recordImpression(signAdToken(id(1), id(2)), id(3))).rejects.toThrow('Invalid ad token');
  });

  it('counts a rendered card only once', async () => {
    vi.spyOn(AdCampaign, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ cpm: 20_000 }) }) } as any);
    const token = signAdToken(id(1), id(2));
    expect(await recordImpression(token, id(2))).toBe(true);
    expect(await recordImpression(token, id(2))).toBe(false);
  });

  it("never counts an advertiser's own preview", async () => {
    vi.spyOn(AdCampaign, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ cpm: 20_000, advertiserId: id(2) }) }) } as any);
    expect(await recordImpression(signAdToken(id(1), id(2)), id(2))).toBe(false);
  });

  it('only redirects to the reviewed https link, never to anything in the request', async () => {
    vi.spyOn(AdCampaign, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ ctaUrl: 'javascript:alert(1)' }) }) } as any);
    expect(await recordClick(signAdToken(id(1), id(2)))).toBeNull();
    expect(await recordClick('forged.token')).toBeNull();
  });
});

describe('wallet ledger', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('applies a repeated operation once', async () => {
    vi.spyOn(LedgerEntry, 'create').mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    const update = vi.spyOn(AdAccount, 'findOneAndUpdate');
    expect(await applyLedger({ userId: id(1), type: 'topup', amount: 100, key: 'same' })).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a debit the wallet cannot cover and removes the entry', async () => {
    const entry = { deleteOne: vi.fn(), save: vi.fn() };
    vi.spyOn(LedgerEntry, 'create').mockResolvedValue(entry as any);
    vi.spyOn(AdAccount, 'findOneAndUpdate').mockResolvedValueOnce({} as any).mockResolvedValueOnce(null);
    expect(await applyLedger({ userId: id(1), type: 'spend', amount: -100, key: 'k' })).toBe(false);
    expect(entry.deleteOne).toHaveBeenCalled();
  });
});

describe('self top-up', () => {
  const load = async (env: Record<string, string>) => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('ADS_SELF_TOPUP', env.ADS_SELF_TOPUP as string);
    if (env.NODE_ENV) vi.stubEnv('NODE_ENV', env.NODE_ENV);
    if (!env.ADS_SELF_TOPUP) delete process.env.ADS_SELF_TOPUP;
    return import('../services/ads.service.js');
  };

  beforeEach(() => vi.unstubAllEnvs());

  it('is on by default outside production', async () => {
    expect((await load({ NODE_ENV: 'test' })).selfTopUpEnabled()).toBe(true);
  });

  it('can be turned off, and refuses when off', async () => {
    const service = await load({ ADS_SELF_TOPUP: 'false' });
    expect(service.selfTopUpEnabled()).toBe(false);
    await expect(service.selfTopUp(id(1), 100_000)).rejects.toMatchObject({ status: 403 });
  });
});

describe('campaign validation', () => {
  const valid = { name: 'n', headline: 'h', ctaUrl: 'https://example.com', topics: ['coffee'], cpm: 20_000, dailyBudget: 50_000, totalBudget: 100_000 };

  it('accepts a sensible campaign and a single topic from a form', () => {
    expect(adCampaignSchema.parse({ ...valid, topics: 'coffee' }).topics).toEqual(['coffee']);
  });

  it('refuses links that are not https', () => {
    for (const ctaUrl of ['http://example.com', 'javascript:alert(1)', 'not a url']) expect(() => adCampaignSchema.parse({ ...valid, ctaUrl }), ctaUrl).toThrow();
  });

  it('refuses unknown topics, no topics, and budgets that make no sense', () => {
    expect(() => adCampaignSchema.parse({ ...valid, topics: ['politics'] })).toThrow();
    expect(() => adCampaignSchema.parse({ ...valid, topics: [] })).toThrow();
    expect(() => adCampaignSchema.parse({ ...valid, totalBudget: 20_000, dailyBudget: 50_000 })).toThrow();
  });
});

describe('VNPay IPN', () => {
  const secret = 'test-hash-secret';
  const signed = (params: Record<string, string>) => {
    const sorted = Object.keys(params).sort().map((key) => `${key}=${encodeURIComponent(params[key]!).replace(/%20/g, '+')}`).join('&');
    return { ...params, vnp_SecureHash: crypto.createHmac('sha512', secret).update(sorted).digest('hex') };
  };
  const ipn = (amount: number, code = '00') => signed({ vnp_Amount: String(amount * 100), vnp_ResponseCode: code, vnp_TmnCode: 'TEST', vnp_TransactionNo: '123', vnp_TransactionStatus: code, vnp_TxnRef: 'ref1' });
  const load = async () => {
    vi.resetModules();
    vi.stubEnv('VNPAY_TMN_CODE', 'TEST');
    vi.stubEnv('VNPAY_HASH_SECRET', secret);
    return import('../services/payment.service.js');
  };
  const order = (fields: Record<string, unknown> = {}) => ({ _id: id(5), userId: id(1), amount: 100_000, txnRef: 'ref1', status: 'pending', save: vi.fn(), ...fields });

  beforeEach(() => vi.restoreAllMocks());

  it('credits the wallet once on a valid confirmation', async () => {
    const { handleIpn } = await load();
    const { PaymentOrder: Orders, LedgerEntry: Ledger, AdAccount: Accounts } = await import('../models/index.js');
    const row = order();
    vi.spyOn(Orders, 'findOne').mockResolvedValue(row as any);
    const create = vi.spyOn(Ledger, 'create').mockResolvedValue({ save: vi.fn() } as any);
    vi.spyOn(Accounts, 'findOneAndUpdate').mockResolvedValue({ balance: 100_000 } as any);
    expect((await handleIpn(ipn(100_000))).RspCode).toBe('00');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ amount: 100_000, idempotencyKey: 'vnpay:ref1' }));
    expect(row.status).toBe('paid');
  });

  it('does nothing for a forged signature', async () => {
    const { handleIpn } = await load();
    const { PaymentOrder: Orders } = await import('../models/index.js');
    const find = vi.spyOn(Orders, 'findOne');
    expect((await handleIpn({ ...ipn(100_000), vnp_SecureHash: 'f'.repeat(128) })).RspCode).toBe('97');
    expect(find).not.toHaveBeenCalled();
  });

  it('refuses a mismatched amount and an unknown order', async () => {
    const { handleIpn } = await load();
    const { PaymentOrder: Orders } = await import('../models/index.js');
    vi.spyOn(Orders, 'findOne').mockResolvedValueOnce(order({ amount: 999 }) as any).mockResolvedValueOnce(null);
    expect((await handleIpn(ipn(100_000))).RspCode).toBe('04');
    expect((await handleIpn(ipn(100_000))).RspCode).toBe('01');
  });

  it('does not credit twice when VNPay repeats itself', async () => {
    const { handleIpn } = await load();
    const { PaymentOrder: Orders, LedgerEntry: Ledger } = await import('../models/index.js');
    vi.spyOn(Orders, 'findOne').mockResolvedValue(order({ status: 'paid' }) as any);
    const create = vi.spyOn(Ledger, 'create');
    expect((await handleIpn(ipn(100_000))).RspCode).toBe('02');
    expect(create).not.toHaveBeenCalled();
  });

  it('marks a declined payment failed without crediting', async () => {
    const { handleIpn } = await load();
    const { PaymentOrder: Orders, LedgerEntry: Ledger } = await import('../models/index.js');
    const row = order();
    vi.spyOn(Orders, 'findOne').mockResolvedValue(row as any);
    const create = vi.spyOn(Ledger, 'create');
    expect((await handleIpn(ipn(100_000, '24'))).RspCode).toBe('00');
    expect(row.status).toBe('failed');
    expect(create).not.toHaveBeenCalled();
  });
});
