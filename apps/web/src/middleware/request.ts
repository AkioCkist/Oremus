import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestContext: RequestHandler = (req, res, next) => {
  req.requestId = req.header('x-request-id') || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
};

export const csrfToken: RequestHandler = (req, res, next) => {
  let token = req.cookies?.csrf as string | undefined;
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
    res.cookie('csrf', token, { sameSite: 'lax', secure: req.secure, httpOnly: false, maxAge: 86_400_000 });
    req.cookies.csrf = token;
  }
  res.locals.csrfToken = token;
  next();
};

export const requireCsrf: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const supplied = req.header('x-csrf-token') || req.body?._csrf;
  const cookie = req.cookies?.csrf;
  if (!cookie || !supplied || cookie.length !== supplied.length || !crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(supplied))) {
    return next(Object.assign(new Error('Your form expired. Refresh the page and try again.'), { status: 403, code: 'CSRF_INVALID' }));
  }
  next();
};

