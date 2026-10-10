import { createHash } from 'node:crypto';
import { redis } from '../config/database.js';
import { env } from '../config/env.js';

// Keys are scoped to the database the jobs belong to: a host-run dev worker and the Docker
// worker can share one Redis, and must never take each other's jobs (their uploads differ).
const scope = createHash('sha1').update(env.MONGODB_URI).digest('hex').slice(0, 10);

/** Redis keys shared by the web app (producer) and the media worker (consumer). */
export const VIDEO_JOBS = `media:${scope}:video:jobs`;
export const VIDEO_ACTIVE = `media:${scope}:video:active`;
/** Sorted set of upload filenames to delete, scored by the time they become safe to remove. */
export const MEDIA_TRASH = `media:${scope}:trash`;

export type VideoJob = { postId: string; mediaId: string; url: string };

export async function enqueueVideoJobs(jobs: VideoJob[]): Promise<void> {
  if (jobs.length) await redis.lPush(VIDEO_JOBS, jobs.map((job) => JSON.stringify(job)));
}

/** Queues every still-processing video of a saved post whose file is one of `urls` (the ones just uploaded). */
export async function enqueuePostVideos(post: { id: string; media: Array<{ _id: unknown; url: string; status?: string }> }, urls: string[]): Promise<void> {
  const fresh = new Set(urls);
  await enqueueVideoJobs(post.media.filter((media) => media.status === 'processing' && fresh.has(media.url)).map((media) => ({ postId: post.id, mediaId: String(media._id), url: media.url })));
}
