import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import sharp from 'sharp';
import { AppError } from '../utils/errors.js';

/**
 * Balanced defaults: long edge capped at 2048px (sharp on any phone/desktop screen, ~4MP),
 * WebP quality 80 (visually close to the source, typically 5–15x smaller than a phone JPEG).
 */
export const IMAGE_MAX_EDGE = 2048;
export const IMAGE_QUALITY = 80;

const ANIMATED_TYPES = new Set(['image/gif', 'image/webp']);
// The file cache keeps inputs open, which blocks deleting originals (notably on Windows).
sharp.cache(false);

export type CompressedImage = { path: string; filename: string; size: number; width: number; height: number };

/**
 * Re-encodes one upload to WebP: applies EXIF rotation, strips metadata (GPS, camera), downsizes, keeps animation.
 * Flat graphics (screenshots, logos) can come out larger as lossy WebP; those switch to lossless WebP instead.
 */
export async function compressImage(inputPath: string, mimeType: string): Promise<CompressedImage> {
  const id = crypto.randomUUID();
  const filename = `${id}.webp`;
  const output = path.join(path.dirname(inputPath), filename);
  const pipeline = sharp(inputPath, { animated: ANIMATED_TYPES.has(mimeType), limitInputPixels: 100_000_000 })
    .autoOrient()
    .resize({ width: IMAGE_MAX_EDGE, height: IMAGE_MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  let info = await pipeline.clone().webp({ quality: IMAGE_QUALITY, alphaQuality: 90, effort: 4, smartSubsample: true }).toFile(output);
  const { size: originalSize } = await fs.stat(inputPath);
  if (info.size > originalSize) {
    const lossless = path.join(path.dirname(inputPath), `${id}.lossless.webp`);
    const alternative = await pipeline.clone().webp({ lossless: true, effort: 4 }).toFile(lossless);
    if (alternative.size < info.size) { await fs.rename(lossless, output); info = alternative; }
    else await fs.rm(lossless, { force: true });
  }
  return { path: output, filename, size: info.size, width: info.width, height: info.height };
}

const uploadedFiles = (req: Parameters<RequestHandler>[0]) => [
  ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat()),
  ...(req.file ? [req.file] : [])
];

/** Runs after multer: swaps every uploaded image for its compressed WebP in place, so services see the final file. */
export const compressUploadedImages: RequestHandler = async (req, _res, next) => {
  const files = uploadedFiles(req);
  try {
    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) continue;
      const result = await compressImage(file.path, file.mimetype);
      await fs.rm(file.path, { force: true });
      Object.assign(file, { path: result.path, filename: result.filename, size: result.size, mimetype: 'image/webp' });
    }
    next();
  } catch {
    await Promise.all(files.map((file) => fs.rm(file.path, { force: true })));
    next(new AppError(422, 'One of the photos could not be read. Try a different file.', 'INVALID_IMAGE'));
  }
};
