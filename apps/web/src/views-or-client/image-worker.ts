/**
 * Image worker: decodes, crops and re-encodes photos off the main thread with OffscreenCanvas,
 * so large phone photos never freeze scrolling or typing while they are processed.
 */

import type { ImageJob, ImageJobResult } from './workers.js';

const scope = self as unknown as DedicatedWorkerGlobalScope;

async function decode(source: Blob | string): Promise<ImageBitmap> {
  const blob = typeof source === 'string' ? await (await fetch(source, { credentials: 'same-origin' })).blob() : source;
  // Apply EXIF rotation so the bitmap matches what an <img> shows.
  return createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
}

async function crop(job: Extract<ImageJob, { task: 'crop' }>): Promise<Blob> {
  const bitmap = await decode(job.source);
  try {
    const canvas = new OffscreenCanvas(job.output.width, job.output.height);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, job.draw.x, job.draw.y, job.draw.width, job.draw.height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: job.quality });
  } finally { bitmap.close(); }
}

/** Shrinks a photo to fit maxEdge. Returns null when the original is already small enough or the result would be larger. */
async function downscale(job: Extract<ImageJob, { task: 'downscale' }>): Promise<Blob | null> {
  const bitmap = await decode(job.file);
  try {
    const scale = Math.min(1, job.maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && job.file.size <= job.maxBytes) return null;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    // PNG keeps transparency; everything else becomes JPEG.
    const type = job.file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await canvas.convertToBlob({ type, quality: job.quality });
    return blob.size < job.file.size ? blob : null;
  } finally { bitmap.close(); }
}

scope.addEventListener('message', async (event: MessageEvent<{ id: number; job: ImageJob }>) => {
  const { id, job } = event.data;
  let result: ImageJobResult;
  try {
    result = { id, ok: true, blob: job.task === 'crop' ? await crop(job) : await downscale(job) };
  } catch (caught) {
    result = { id, ok: false, error: caught instanceof Error ? caught.message : 'Image processing failed.' };
  }
  scope.postMessage(result);
});
