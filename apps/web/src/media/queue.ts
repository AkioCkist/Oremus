import { redis } from '../config/database.js';

/** Redis keys shared by the web app (producer) and the media worker (consumer). */
export const VIDEO_JOBS = 'media:video:jobs';
export const VIDEO_ACTIVE = 'media:video:active';
/** Sorted set of upload filenames to delete, scored by the time they become safe to remove. */
export const MEDIA_TRASH = 'media:trash';

export type VideoJob = { postId: string; mediaId: string; url: string };

export async function enqueueVideoJobs(jobs: VideoJob[]): Promise<void> {
  if (jobs.length) await redis.lPush(VIDEO_JOBS, jobs.map((job) => JSON.stringify(job)));
}

/** Queues every still-processing video of a saved post whose file is one of `urls` (the ones just uploaded). */
export async function enqueuePostVideos(post: { id: string; media: Array<{ _id: unknown; url: string; status?: string }> }, urls: string[]): Promise<void> {
  const fresh = new Set(urls);
  await enqueueVideoJobs(post.media.filter((media) => media.status === 'processing' && fresh.has(media.url)).map((media) => ({ postId: post.id, mediaId: String(media._id), url: media.url })));
}
