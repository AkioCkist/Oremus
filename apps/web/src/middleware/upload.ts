import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../utils/errors.js';

// Generous caps: everything is re-encoded server-side, so originals never reach viewers for long.
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const videoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const extension: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };

const storage = multer.diskStorage({
  destination: path.resolve(process.cwd(), 'uploads'),
  filename: (_req, file, done) => done(null, `${crypto.randomUUID()}${extension[file.mimetype] || ''}`)
});

export const upload = multer({
  storage,
  limits: { fileSize: IMAGE_MAX_BYTES, files: 4 },
  fileFilter: (_req, file, done) => imageTypes.has(file.mimetype) ? done(null, true) : done(new AppError(415, 'Only JPEG, PNG, WebP, and GIF images are accepted.', 'INVALID_MEDIA'))
});

/** Post media: any number of photos and videos. Multer only knows one size cap, so photos are re-checked after upload. */
export const postUpload = multer({
  storage,
  limits: { fileSize: VIDEO_MAX_BYTES },
  fileFilter: (_req, file, done) => imageTypes.has(file.mimetype) || videoTypes.has(file.mimetype) ? done(null, true) : done(new AppError(415, 'Only JPEG, PNG, WebP, GIF images and MP4, WebM, MOV videos are accepted.', 'INVALID_MEDIA'))
});

export const enforcePostMediaSize: RequestHandler = async (req, _res, next) => {
  const files = [...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat()), ...(req.file ? [req.file] : [])];
  if (!files.some((file) => imageTypes.has(file.mimetype) && file.size > IMAGE_MAX_BYTES)) return next();
  await Promise.all(files.map((file) => fs.rm(file.path, { force: true })));
  next(new AppError(413, 'Photos must be 20 MB or smaller.', 'MEDIA_TOO_LARGE'));
};
