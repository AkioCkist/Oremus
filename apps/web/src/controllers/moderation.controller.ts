import type { Request, Response } from 'express';
import { appealCase, createReport } from '../services/moderation.service.js';
import { appealSchema, reportSchema } from '../validators/index.js';

export async function report(req: Request, res: Response) {
  await createReport(req.user!.id, reportSchema.parse(req.body));
  res.status(201).json({ ok: true });
}

export async function appeal(req: Request, res: Response) {
  await appealCase(req.user!.id, String(req.params.caseId), appealSchema.parse(req.body).message);
  res.json({ ok: true });
}
