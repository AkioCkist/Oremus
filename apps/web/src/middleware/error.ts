import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

export const notFound: RequestHandler = (req, _res, next) => next(new AppError(404, `Route ${req.path} was not found`, 'NOT_FOUND'));

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  void _next;
  const isValidation = error instanceof ZodError;
  const status = error instanceof AppError ? error.status : isValidation ? 422 : typeof error?.status === 'number' ? error.status : 500;
  const message = status >= 500 ? 'Something went wrong. Please try again.' : error.message;
  if (status >= 500) logger.error({ error, requestId: req.requestId }, 'Unhandled request error');
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    res.status(status).json({ ok: false, error: { code: isValidation ? 'VALIDATION_ERROR' : error.code ?? 'INTERNAL_ERROR', message, details: isValidation ? error.flatten() : error.details }, requestId: req.requestId });
    return;
  }
  res.status(status).render('error', { title: status === 404 ? 'Page not found' : 'Something went wrong', status, message, csrfToken: req.cookies?.csrf || '', currentUser: req.user?.toObject() ?? null, path: req.path });
};

