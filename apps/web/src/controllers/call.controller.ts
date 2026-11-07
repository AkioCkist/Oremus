import type { Request, Response } from 'express';
import * as calls from '../services/call.service.js';
import { env } from '../config/env.js';
import { startCallSchema } from '../validators/index.js';

const callId = (req: Request) => String(req.params.callId);

/**
 * In development a LiveKit URL on localhost only works for a browser on this machine.
 * A phone on the LAN opening the site by IP gets the same host it used for the page.
 */
function livekitUrlFor(req: Request, url: string) {
  if (env.NODE_ENV === 'production' || !url) return url;
  const target = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || ['localhost', '127.0.0.1'].includes(req.hostname)) return url;
  target.hostname = req.hostname;
  return target.toString().replace(/\/$/, '');
}

const withLanUrl = <T extends { url: string }>(req: Request, details: T) => ({ ...details, url: livekitUrlFor(req, details.url) });

export async function start(req: Request, res: Response) {
  const { conversationId, kind } = startCallSchema.parse(req.body);
  res.status(201).json({ ok: true, data: await calls.startCall(req.user!.id, conversationId, kind) });
}

export async function accept(req: Request, res: Response) {
  res.json({ ok: true, data: withLanUrl(req, await calls.acceptCall(req.user!.id, callId(req))) });
}

export async function join(req: Request, res: Response) {
  res.json({ ok: true, data: withLanUrl(req, await calls.joinCall(req.user!.id, callId(req))) });
}

export async function decline(req: Request, res: Response) {
  await calls.declineCall(req.user!.id, callId(req));
  res.json({ ok: true, data: {} });
}

export async function end(req: Request, res: Response) {
  await calls.endCall(req.user!.id, callId(req));
  res.json({ ok: true, data: {} });
}

export async function active(req: Request, res: Response) {
  res.json({ ok: true, data: { call: await calls.activeCall(req.user!.id) } });
}

export async function livekitWebhook(req: Request, res: Response) {
  try {
    await calls.handleLivekitWebhook(req.body.toString('utf8'), req.get('authorization'));
    res.sendStatus(200);
  } catch {
    // Almost always a bad signature, and nothing about why is useful to whoever sent it.
    res.sendStatus(401);
  }
}
