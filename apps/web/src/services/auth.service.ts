import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env } from '../config/env.js';
import { redis } from '../config/database.js';
import { RefreshToken, User } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { audit } from './audit.service.js';

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const cookieBase = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax' as const, path: '/' };
const sessionRefreshDays = 1;
const invalidPasswordHash = '$2b$12$bOpTTq8VuI94HKKW9SbdNujtK/LBatZknphyhXacDlsYj13M/WSiW';
type SessionContext = { ip?: string; userAgent?: string };
type RefreshClaims = jwt.JwtPayload & { type: 'refresh'; family: string; remember?: boolean };

function signAccess(userId: string): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, { subject: userId, jwtid: jti, expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] });
  return { token, jti };
}

function refreshDays(remember: boolean): number {
  return remember ? env.REFRESH_TOKEN_DAYS : sessionRefreshDays;
}

function signRefresh(userId: string, family: string, remember: boolean): string {
  return jwt.sign({ type: 'refresh', family, remember }, env.JWT_REFRESH_SECRET, { subject: userId, jwtid: crypto.randomUUID(), expiresIn: `${refreshDays(remember)}d` });
}

async function persistRefresh(userId: string, raw: string, family: string, remember: boolean, context: SessionContext): Promise<void> {
  await RefreshToken.create({ userId, tokenHash: digest(raw), family, expiresAt: new Date(Date.now() + refreshDays(remember) * 86_400_000), ip: context.ip, userAgent: context.userAgent });
}

function setCookies(res: Response, access: string, refresh: string, remember: boolean): void {
  const accessLifetime = remember ? { maxAge: 15 * 60_000 } : {};
  const refreshLifetime = remember ? { maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000 } : {};
  res.cookie('access_token', access, { ...cookieBase, ...accessLifetime });
  res.cookie('refresh_token', refresh, { ...cookieBase, ...refreshLifetime });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie('access_token', cookieBase);
  res.clearCookie('refresh_token', cookieBase);
}

export async function register(input: { email: string; username: string; displayName: string; password: string }, res: Response, context: { ip?: string; userAgent?: string }) {
  const [emailTaken, usernameTaken] = await Promise.all([User.exists({ email: input.email }), User.exists({ username: input.username })]);
  if (emailTaken || usernameTaken) {
    // Same shape as validation errors so the sign-up form can point at the field that needs changing.
    const fieldErrors: Record<string, string[]> = {};
    if (emailTaken) fieldErrors.email = ['An account with this email already exists. Log in instead?'];
    if (usernameTaken) fieldErrors.username = ['That username is already taken. Try another one.'];
    throw new AppError(409, 'That email or username is already in use.', 'IDENTITY_TAKEN', { fieldErrors });
  }
  const user = await User.create({ ...input, passwordHash: await bcrypt.hash(input.password, 12) });
  const remember = false, family = crypto.randomUUID(), refresh = signRefresh(user.id, family, remember), access = signAccess(user.id);
  await persistRefresh(user.id, refresh, family, remember, context);
  setCookies(res, access.token, refresh, remember);
  await audit('auth.register', user.id, 'User', user.id, {}, context.ip);
  return publicUser(user);
}

export async function login(input: { email: string; password: string; remember: boolean }, res: Response, context: SessionContext) {
  const user = await User.findOne({ email: input.email, deletedAt: null }).select('+passwordHash');
  const passwordMatches = await bcrypt.compare(input.password, user?.passwordHash || invalidPasswordHash);
  if (!user || !passwordMatches) throw new AppError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
  const family = crypto.randomUUID(), refresh = signRefresh(user.id, family, input.remember), access = signAccess(user.id);
  await persistRefresh(user.id, refresh, family, input.remember, context);
  setCookies(res, access.token, refresh, input.remember);
  await audit('auth.login', user.id, 'User', user.id, {}, context.ip);
  return publicUser(user);
}

async function rotateSession(raw: string | undefined, res: Response, context: SessionContext) {
  if (!raw) throw new AppError(401, 'Refresh token is missing.', 'REFRESH_REQUIRED');
  let claims: RefreshClaims;
  try { claims = jwt.verify(raw, env.JWT_REFRESH_SECRET) as RefreshClaims; } catch { throw new AppError(401, 'Session has expired.', 'REFRESH_INVALID'); }
  if (claims.type !== 'refresh' || !claims.family || !claims.sub) throw new AppError(401, 'Session is invalid.', 'REFRESH_INVALID');
  const record = await RefreshToken.findOne({ tokenHash: digest(raw) });
  if (!record || record.revokedAt) {
    if (claims.family) await RefreshToken.updateMany({ family: claims.family, revokedAt: null }, { revokedAt: new Date() });
    throw new AppError(401, 'Session could not be refreshed. Please sign in again.', 'REFRESH_REUSED');
  }
  const user = await User.findOne({ _id: claims.sub, deletedAt: null });
  if (!user) throw new AppError(401, 'Account is unavailable.', 'ACCOUNT_UNAVAILABLE');
  const remember = claims.remember !== false;
  const next = signRefresh(user.id, record.family, remember), nextHash = digest(next), access = signAccess(user.id);
  record.revokedAt = new Date(); record.replacedByHash = nextHash; await record.save();
  await persistRefresh(user.id, next, record.family, remember, context);
  setCookies(res, access.token, next, remember);
  return { user, jti: access.jti };
}

export async function rotate(raw: string | undefined, res: Response, context: SessionContext) {
  const session = await rotateSession(raw, res, context);
  return publicUser(session.user);
}

export async function restoreSession(raw: string | undefined, res: Response, context: SessionContext) {
  return rotateSession(raw, res, context);
}

export async function logout(rawRefresh: string | undefined, jti: string | undefined, res: Response): Promise<void> {
  if (rawRefresh) await RefreshToken.updateOne({ tokenHash: digest(rawRefresh), revokedAt: null }, { revokedAt: new Date() });
  if (jti) await redis.set(`deny:${jti}`, '1', { EX: 15 * 60 });
  clearSessionCookies(res);
}

export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await User.findOne({ email, deletedAt: null }).select('+passwordResetHash +passwordResetExpiresAt');
  if (!user) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  user.passwordResetHash = digest(token); user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60_000); await user.save();
  return token;
}

export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  const user = await User.findOne({ passwordResetHash: digest(token), passwordResetExpiresAt: { $gt: new Date() }, deletedAt: null }).select('+passwordResetHash +passwordResetExpiresAt');
  if (!user) throw new AppError(400, 'Reset link is invalid or expired.', 'RESET_INVALID');
  user.passwordHash = await bcrypt.hash(password, 12); user.passwordResetHash = undefined; user.passwordResetExpiresAt = undefined; await user.save();
  await RefreshToken.updateMany({ userId: user.id, revokedAt: null }, { revokedAt: new Date() });
}

export function publicUser(user: any) {
  return { id: user.id, email: user.email, username: user.username, displayName: user.displayName, profile: user.profile };
}

