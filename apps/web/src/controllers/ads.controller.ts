import type { Request, Response } from 'express';
import * as ads from '../services/ads.service.js';
import { handleIpn, readReturn, startTopUp } from '../services/payment.service.js';
import { adCampaignSchema, adImpressionSchema, adPreferenceSchema, topUpSchema } from '../validators/index.js';

const param = (req: Request, name: string) => String(req.params[name]);

export async function createCampaign(req: Request, res: Response) {
  const campaign = await ads.createCampaign(req.user!.id, adCampaignSchema.parse(req.body), req.file);
  res.status(201).json({ ok: true, data: { id: campaign.id } });
}

export async function updateCampaign(req: Request, res: Response) {
  const campaign = await ads.updateCampaign(req.user!.id, param(req, 'campaignId'), adCampaignSchema.parse(req.body), req.file);
  res.json({ ok: true, data: { id: campaign.id } });
}

export async function pauseCampaign(req: Request, res: Response) {
  await ads.setCampaignRunning(req.user!.id, param(req, 'campaignId'), false);
  res.json({ ok: true, data: {} });
}

export async function resumeCampaign(req: Request, res: Response) {
  await ads.setCampaignRunning(req.user!.id, param(req, 'campaignId'), true);
  res.json({ ok: true, data: {} });
}

export async function endCampaign(req: Request, res: Response) {
  await ads.endCampaign(req.user!.id, param(req, 'campaignId'));
  res.json({ ok: true, data: {} });
}

export async function campaignStats(req: Request, res: Response) {
  res.json({ ok: true, data: { days: await ads.campaignStats(req.user!.id, param(req, 'campaignId')) } });
}

export async function impression(req: Request, res: Response) {
  await ads.recordImpression(adImpressionSchema.parse(req.body).token, req.user!.id);
  res.json({ ok: true, data: {} });
}

export async function preferences(req: Request, res: Response) {
  const { action, value } = adPreferenceSchema.parse(req.body);
  await ads.updatePreferences(req.user!.id, action, value);
  res.json({ ok: true, data: {} });
}

export async function topUp(req: Request, res: Response) {
  const { amount } = topUpSchema.parse(req.body);
  res.json({ ok: true, data: await startTopUp(req.user!.id, amount, req.ip || '127.0.0.1') });
}

export async function selfTopUp(req: Request, res: Response) {
  const { amount } = topUpSchema.parse(req.body);
  res.json({ ok: true, data: await ads.selfTopUp(req.user!.id, amount) });
}

export async function vnpayIpn(req: Request, res: Response) {
  res.json(await handleIpn(req.query));
}

export function vnpayReturn(req: Request, res: Response) {
  res.redirect(302, `/ads/manage?payment=${readReturn(req.query)}`);
}

export async function click(req: Request, res: Response) {
  res.redirect(302, (await ads.recordClick(param(req, 'token'))) || '/');
}
