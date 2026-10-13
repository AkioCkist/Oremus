/**
 * Small pool of background workers for CPU-heavy browser tasks (photo decoding, cropping, re-encoding).
 * Workers start lazily, jobs go to the least busy worker, and callers fall back to the main thread
 * when the browser lacks Worker/OffscreenCanvas support or a worker fails.
 */

export type ImageJob =
  | { task: 'crop'; source: Blob | string; draw: { x: number; y: number; width: number; height: number }; output: { width: number; height: number }; quality: number }
  | { task: 'downscale'; file: Blob; maxEdge: number; maxBytes: number; quality: number };
export type ImageJobResult = { id: number; ok: true; blob: Blob | null } | { id: number; ok: false; error: string };

type Slot = { worker: Worker; busy: number };
type Pending = { resolve: (blob: Blob | null) => void; reject: (error: Error) => void; slot: Slot };

// The bundle is loaded as /assets/app.js?v=<hash>; the worker shares the same content hash.
const WORKER_URL = `/assets/image-worker.js${new URL(import.meta.url).search}`;
const POOL_SIZE = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));

export const imageWorkersSupported = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
  && typeof createImageBitmap === 'function' && 'convertToBlob' in OffscreenCanvas.prototype;

const slots: Slot[] = [];
const pending = new Map<number, Pending>();
let nextId = 1;
let broken = false;

function failAll(slot: Slot, message: string) {
  for (const [id, job] of pending) if (job.slot === slot) { pending.delete(id); job.reject(new Error(message)); }
}

function spawn(): Slot {
  const slot: Slot = { worker: new Worker(WORKER_URL), busy: 0 };
  slot.worker.addEventListener('message', (event: MessageEvent<ImageJobResult>) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id); slot.busy -= 1;
    if (event.data.ok) job.resolve(event.data.blob); else job.reject(new Error(event.data.error));
  });
  slot.worker.addEventListener('error', (event) => {
    // A worker that fails to load (offline, blocked script) is unusable; stop routing jobs to workers.
    event.preventDefault(); broken = true;
    slot.worker.terminate(); slots.splice(slots.indexOf(slot), 1);
    failAll(slot, 'Image worker stopped.');
  });
  slots.push(slot);
  return slot;
}

function pickSlot(): Slot {
  const idle = slots.find((slot) => slot.busy === 0);
  if (idle) return idle;
  if (slots.length < POOL_SIZE) return spawn();
  return slots.reduce((least, slot) => (slot.busy < least.busy ? slot : least));
}

export function runImageJob(job: ImageJob): Promise<Blob | null> {
  if (!imageWorkersSupported || broken) return Promise.reject(new Error('Image workers are unavailable.'));
  return new Promise((resolve, reject) => {
    const slot = pickSlot();
    const id = nextId++;
    pending.set(id, { resolve, reject, slot });
    slot.busy += 1;
    slot.worker.postMessage({ id, job });
  });
}

/* ---------- Upload optimization ---------- */

// Matches the server's IMAGE_MAX_EDGE: anything bigger is downsized there anyway, so sending it only wastes bandwidth.
const UPLOAD_MAX_EDGE = 2048;
const UPLOAD_MAX_BYTES = 1.5 * 1024 * 1024;
// GIF and WebP may be animated; canvas would keep only the first frame.
const DOWNSCALE_TYPES = new Set(['image/jpeg', 'image/png']);

/**
 * Shrinks a large photo in a background worker before upload (also strips EXIF/GPS metadata).
 * Always resolves: on any failure or when nothing is gained, the original file is returned.
 */
export async function optimizeUpload(file: File): Promise<File> {
  if (!DOWNSCALE_TYPES.has(file.type) || file.size <= 256 * 1024) return file;
  try {
    const blob = await runImageJob({ task: 'downscale', file, maxEdge: UPLOAD_MAX_EDGE, maxBytes: UPLOAD_MAX_BYTES, quality: 0.92 });
    if (!blob) return file;
    const name = blob.type === file.type ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
  } catch { return file; }
}

/** Returns a copy of the form data with every photo optimized in parallel across the worker pool; entry order is kept. */
export async function optimizeFormUploads(form: FormData): Promise<FormData> {
  const entries = [...form.entries()];
  if (!entries.some(([, value]) => value instanceof File && DOWNSCALE_TYPES.has(value.type))) return form;
  const values = await Promise.all(entries.map(([, value]) => (value instanceof File ? optimizeUpload(value) : value)));
  const next = new FormData();
  entries.forEach(([key], index) => {
    const value = values[index]!;
    if (value instanceof File) next.append(key, value, value.name); else next.append(key, value);
  });
  return next;
}
