import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { AppError } from '../utils/errors.js';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const extension: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

export const upload = multer({
  storage: multer.diskStorage({
    destination: path.resolve(process.cwd(), 'uploads'),
    filename: (_req, file, done) => done(null, `${crypto.randomUUID()}${extension[file.mimetype] || ''}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, done) => allowed.has(file.mimetype) ? done(null, true) : done(new AppError(415, 'Only JPEG, PNG, WebP, and GIF images are accepted.', 'INVALID_MEDIA'))
});

