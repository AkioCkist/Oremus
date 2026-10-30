import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { SEED_USER_AGENT, libraryPhoto } from './seed-photo-library.js';

/**
 * Downloads real photos for the sample data and stores them like normal uploads (WebP in `uploads/`).
 *
 * - Curated photos: Lorem Picsum (https://picsum.photos), images from Unsplash under the Unsplash license.
 * - Crowd photos: Wikimedia Commons, one per post. See seed-photo-library.json for author and license.
 * - Portraits: Pravatar (https://pravatar.cc), xsgames (https://xsgames.co/randomusers) and randomuser.me.
 *
 * Files are named after their source (`seed-photo-1060-1600x1200.webp`), so re-running the seed reuses them
 * instead of downloading again. When a file can't be downloaded the URL is empty: posts go without a photo and
 * people show their initials, so seeding still works offline and never fills the feed with placeholders.
 */

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const TIMEOUT_MS = 20_000;
const CONCURRENCY = 3;
const MAX_RETRIES = 20;
const MAX_WAIT_SECONDS = 120;

export type SeedImageRequest =
  | { kind: 'photo'; id: number; width: number; height: number }
  | { kind: 'library'; id: number; width: number; height: number }
  | { kind: 'avatar'; id: number | string };

export const photo = (id: number, width = 1600, height = 1200): SeedImageRequest => ({ kind: 'photo', id, width, height });
/** A Commons photo, resized on the way in. Height 0 keeps its shape. */
export const library = (id: number, width = 1080, height = 0): SeedImageRequest => ({ kind: 'library', id, width, height });
export const avatar = (id: number | string): SeedImageRequest => ({ kind: 'avatar', id });
/** A story photo: `commons-<pageid>` from the library, or a curated Lorem Picsum id. */
export const storyImage = (id: number | string): SeedImageRequest => (typeof id === 'string' ? library(Number(id.replace('commons-', '')), 1080, 1920) : photo(id, 1080, 1920));

const fileName = (request: SeedImageRequest) => {
  if (request.kind === 'photo') return `seed-photo-${request.id}-${request.width}x${request.height}.webp`;
  if (request.kind === 'library') return `seed-library-${request.id}-${request.width}x${request.height}.webp`;
  return `seed-avatar-${request.id}.webp`;
};

/** Crowd portraits are named `<source>-<gender>-<n>`; numeric ids are curated Pravatar portraits. */
const portraitUrl = (id: number | string) => {
  if (typeof id === 'number') return `https://i.pravatar.cc/600?img=${id}`;
  const [source, gender, number] = id.split('-');
  return source === 'xsgames'
    ? `https://xsgames.co/randomusers/assets/avatars/${gender}/${number}.jpg`
    : `https://randomuser.me/api/portraits/${gender === 'female' ? 'women' : 'men'}/${number}.jpg`;
};

const sourceUrl = (request: SeedImageRequest) => {
  if (request.kind === 'photo') return `https://picsum.photos/id/${request.id}/${request.width}/${request.height}`;
  if (request.kind === 'library') return libraryPhoto(request.id)?.url || '';
  return portraitUrl(request.id);
};

export const seedImageUrl = (request: SeedImageRequest) => `/uploads/${fileName(request)}`;
const requestKey = (request: SeedImageRequest) => fileName(request);
class PermanentError extends Error {}

async function exists(file: string) {
  try { await fs.access(file); return true; } catch { return false; }
}

/** Bulk downloads get rate-limited and drop now and then, so both only pause the work. 404 and the like are final. */
async function download(url: string): Promise<Buffer> {
  for (let attempt = 0; ; attempt += 1) {
    let wait = Math.min((attempt + 1) * 10, MAX_WAIT_SECONDS);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow', headers: { 'user-agent': SEED_USER_AGENT } });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      if (response.status !== 429 && response.status < 500) throw new PermanentError(`${response.status} ${url}`);
      wait = Math.max(wait, Math.min(Number(response.headers.get('retry-after')) || 0, MAX_WAIT_SECONDS));
    } catch (error) {
      if (error instanceof PermanentError) throw error;
    }
    if (attempt >= MAX_RETRIES) throw new Error(`Gave up on ${url}`);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  }
}

type Outcome = 'cached' | 'downloaded' | 'missing';

async function materialize(request: SeedImageRequest): Promise<Outcome> {
  const target = path.join(UPLOADS_DIR, fileName(request));
  if (await exists(target)) return 'cached';
  try {
    const source = await download(sourceUrl(request));
    const image = sharp(source).rotate();
    if (request.kind === 'library') image.resize(request.width, request.height || null, { fit: 'cover' });
    // Same settings as real uploads (src/media/image.ts): WebP q80, no metadata.
    await image.webp({ quality: 80 }).toFile(target);
    return 'downloaded';
  } catch { return 'missing'; }
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
 * Returns a lookup from request to its public URL ('' for a file that could not be fetched).
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
  console.log(`  ${count('downloaded')} downloaded, ${count('cached')} reused, ${count('missing')} unavailable.`);
  return (request) => (outcomes.get(requestKey(request)) === 'missing' ? '' : seedImageUrl(request));
}
