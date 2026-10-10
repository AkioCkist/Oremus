import type { Request, Response } from 'express';
import { registerSchema, loginSchema, resetRequestSchema, resetConfirmSchema } from '../validators/index.js';
import * as auth from '../services/auth.service.js';
import { env } from '../config/env.js';

const context = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });

export async function register(req: Request, res: Response) {
  const user = await auth.register(registerSchema.parse(req.body), res, context(req));
  res.status(201).json({ ok: true, data: { user, redirect: '/' } });
}
export async function login(req: Request, res: Response) {
  const user = await auth.login(loginSchema.parse(req.body), res, context(req));
  res.json({ ok: true, data: { user, redirect: '/' } });
}
export async function refresh(req: Request, res: Response) {
  const user = await auth.rotate(req.cookies?.refresh_token, res, context(req));
  res.json({ ok: true, data: { user } });
}
export async function logout(req: Request, res: Response) {
  await auth.logout(req.cookies?.refresh_token, req.auth?.jti, res);
  res.json({ ok: true, data: { redirect: '/login' } });
}
export async function requestReset(req: Request, res: Response) {
  const { email } = resetRequestSchema.parse(req.body);
  const token = await auth.requestPasswordReset(email);
  res.json({ ok: true, data: { message: 'If that account exists, a reset link has been created.', ...(env.NODE_ENV === 'development' && token ? { developmentToken: token } : {}) } });
}
export async function confirmReset(req: Request, res: Response) {
  const input = resetConfirmSchema.parse(req.body); await auth.confirmPasswordReset(input.token, input.password);
  res.json({ ok: true, data: { message: 'Password updated. You can sign in now.' } });
}

