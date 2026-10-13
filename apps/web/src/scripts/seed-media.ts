import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Downloads real photos for the sample data and stores them like normal uploads (WebP in `uploads/`).
 *
 * - Photos: Lorem Picsum (https://picsum.photos), images from Unsplash under the Unsplash license.
 * - Portraits: Pravatar (https://pravatar.cc), placeholder avatars made for demos.
 *
 * Files are named after their source (`seed-photo-1060-1600x1200.webp`), so re-running the seed reuses them
 * instead of downloading again. When the network is unavailable, photos fall back to a generated gradient
 * and avatars to an empty URL (the app then shows initials), so seeding still works offline.
 */

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;

export type SeedImageRequest =
  | { kind: 'photo'; id: number; width: number; height: number }
  | { kind: 'avatar'; id: number };

export const photo = (id: number, width = 1600, height = 1200): SeedImageRequest => ({ kind: 'photo', id, width, height });
export const avatar = (id: number): SeedImageRequest => ({ kind: 'avatar', id });

const fileName = (request: SeedImageRequest) => request.kind === 'photo'
  ? `seed-photo-${request.id}-${request.width}x${request.height}.webp`
  : `seed-avatar-${request.id}.webp`;

const sourceUrl = (request: SeedImageRequest) => request.kind === 'photo'
  ? `https://picsum.photos/id/${request.id}/${request.width}/${request.height}`
  : `https://i.pravatar.cc/600?img=${request.id}`;

export const seedImageUrl = (request: SeedImageRequest) => `/uploads/${fileName(request)}`;
const requestKey = (request: SeedImageRequest) => fileName(request);

async function exists(file: string) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/** A soft two-color gradient that stands in for a photo when it can't be downloaded. */
function placeholder(request: Extract<SeedImageRequest, { kind: 'photo' }>) {
  const hue = (request.id * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${request.width}" height="${request.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},65%,38%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg));
}

type Outcome = 'cached' | 'downloaded' | 'placeholder' | 'missing';

async function materialize(request: SeedImageRequest): Promise<Outcome> {
  const target = path.join(UPLOADS_DIR, fileName(request));
  if (await exists(target)) return 'cached';
  try {
    const source = await download(sourceUrl(request));
    // Same settings as real uploads (src/media/image.ts): WebP q80, no metadata.
    await sharp(source).rotate().webp({ quality: 80 }).toFile(target);
    return 'downloaded';
  } catch {
    if (request.kind === 'avatar') return 'missing';
    await placeholder(request).webp({ quality: 80 }).toFile(target);
    return 'placeholder';
  }
}

/**
 * Checks that the running web server can serve a seeded file. It can't when the seed ran on the host
 * but the app runs in Docker: `uploads/` there is a named volume, separate from the host folder.
 * Returns null when the server is unreachable (nothing to compare against).
 */
export async function isServedBy(origin: string, publicUrl: string): Promise<boolean | null> {
  try {
    const response = await fetch(new URL(publicUrl, origin), { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch { return null; }
}

/**
 * Makes sure every requested image exists in `uploads/`, downloading in parallel.
 * Returns a lookup from request to its public URL ('' for an avatar that could not be fetched).
 */
export async function prepareSeedImages(requests: SeedImageRequest[]): Promise<(request: SeedImageRequest) => string> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const unique = [...new Map(requests.map((request) => [requestKey(request), request])).values()];
  const outcomes = new Map<string, Outcome>();
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < unique.length) {
      const request = unique[next++]!;
      outcomes.set(requestKey(request), await materialize(request));
      done += 1;
      if (done % 20 === 0 || done === unique.length) process.stdout.write(`\r  images ${done}/${unique.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write('\n');
  const count = (outcome: Outcome) => [...outcomes.values()].filter((value) => value === outcome).length;
  console.log(`  ${count('downloaded')} downloaded, ${count('cached')} reused, ${count('placeholder')} placeholders, ${count('missing')} avatars unavailable.`);
  return (request) => (outcomes.get(requestKey(request)) === 'missing' ? '' : seedImageUrl(request));
}
