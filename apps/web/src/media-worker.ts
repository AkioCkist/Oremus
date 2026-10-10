import fs from 'node:fs/promises';
import path from 'node:path';
import { connectInfrastructure, disconnectInfrastructure, redis } from './config/database.js';
import { logger } from './config/logger.js';
import { Post } from './models/index.js';
import { compressVideo } from './media/video.js';
import { enqueueVideoJobs, MEDIA_TRASH, VIDEO_ACTIVE, VIDEO_JOBS, type VideoJob } from './media/queue.js';
import { invalidateSocialCaches } from './services/cache.service.js';

/**
 * Media worker: transcodes uploaded post videos off the request path.
 * One job at a time (ffmpeg already uses every core); run a single instance.
 */
const UPLOADS = path.resolve(process.cwd(), 'uploads');
// Pages rendered before the swap still point at the original file, so it stays around for a while.
const ORIGINAL_GRACE_MS = 15 * 60 * 1000;
const STUCK_AFTER_MS = 2 * 60 * 1000;
const REQUEUE_EVERY_MS = 5 * 60 * 1000;
let stopping = false;

const uploadPath = (url: string) => path.join(UPLOADS, path.basename(url));

async function processJob(job: VideoJob) {
  const input = uploadPath(job.url);
  const match = { _id: job.postId, media: { $elemMatch: { _id: job.mediaId, url: job.url } } };
  if (!(await fs.stat(input).catch(() => null))) {
    // Without its file the video can never be transcoded; don't leave it "processing" forever.
    logger.warn({ job }, 'Video source is gone; marking it failed');
    await Post.updateOne({ ...match, 'media.status': 'processing' }, { $set: { 'media.$.status': 'failed' } });
    return;
  }
  const started = Date.now();
  let result;
  try { result = await compressVideo(input); }
  catch (error) {
    logger.error({ error, job }, 'Video transcode failed; keeping the original');
    await Post.updateOne(match, { $set: { 'media.$.status': 'failed' } });
    return;
  }
  const post = await Post.findOneAndUpdate(match, { $set: { 'media.$.url': `/uploads/${result.filename}`, 'media.$.mimeType': 'video/mp4', 'media.$.poster': `/uploads/${result.posterFilename}`, 'media.$.status': 'ready' } }, { projection: { authorId: 1 } });
  if (!post) {
    // The video was removed or replaced while transcoding; nothing references the new files.
    await Promise.all([fs.rm(result.path, { force: true }), fs.rm(result.posterPath, { force: true })]);
    return;
  }
  await redis.zAdd(MEDIA_TRASH, { score: Date.now() + ORIGINAL_GRACE_MS, value: path.basename(input) });
  await invalidateSocialCaches([String(post.authorId)]);
  const [before, after] = await Promise.all([fs.stat(input), fs.stat(result.path)]);
  logger.info({ job, ms: Date.now() - started, before: before.size, after: after.size }, 'Video compressed');
}

async function sweepTrash() {
  const due = await redis.zRangeByScore(MEDIA_TRASH, 0, Date.now());
  for (const name of due) {
    await fs.rm(path.join(UPLOADS, path.basename(name)), { force: true });
    await redis.zRem(MEDIA_TRASH, name);
  }
}

/**
 * Re-queues videos still marked "processing" that no job covers (a lost job, a Redis flush, a
 * crash between saving the post and queueing). Recent posts are skipped: their job may be in flight.
 */
async function requeueStuckVideos() {
  const queued = new Set([...await redis.lRange(VIDEO_JOBS, 0, -1), ...await redis.lRange(VIDEO_ACTIVE, 0, -1)]
    .map((raw) => { try { return (JSON.parse(raw) as VideoJob).mediaId; } catch { return ''; } }));
  const posts = await Post.find({ deletedAt: null, 'media.status': 'processing', updatedAt: { $lt: new Date(Date.now() - STUCK_AFTER_MS) } }).select('media').lean();
  const jobs = posts.flatMap((post: any) => post.media
    .filter((media: any) => media.status === 'processing' && !queued.has(String(media._id)))
    .map((media: any) => ({ postId: String(post._id), mediaId: String(media._id), url: media.url })));
  if (jobs.length) { await enqueueVideoJobs(jobs); logger.warn({ count: jobs.length }, 'Re-queued stuck videos'); }
}

async function start() {
  await connectInfrastructure();
  const blocking = redis.duplicate();
  await blocking.connect();
  // Jobs left "active" by a crash or restart go back to the queue.
  while (await redis.lMove(VIDEO_ACTIVE, VIDEO_JOBS, 'RIGHT', 'RIGHT')) { /* drain */ }
  logger.info('Media worker is ready');

  const shutdown = () => { stopping = true; };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);

  let nextRequeue = 0;
  while (!stopping) {
    await sweepTrash().catch((error) => logger.error({ error }, 'Trash sweep failed'));
    if (Date.now() >= nextRequeue) {
      nextRequeue = Date.now() + REQUEUE_EVERY_MS;
      await requeueStuckVideos().catch((error) => logger.error({ error }, 'Stuck video sweep failed'));
    }
    const raw = await blocking.blMove(VIDEO_JOBS, VIDEO_ACTIVE, 'RIGHT', 'LEFT', 5);
    if (!raw) continue;
    try { await processJob(JSON.parse(raw) as VideoJob); }
    catch (error) { logger.error({ error, raw }, 'Video job crashed'); }
    finally { await redis.lRem(VIDEO_ACTIVE, 1, raw); }
  }
  await blocking.quit();
  await disconnectInfrastructure();
  process.exit(0);
}

start().catch((error) => { logger.fatal({ error }, 'Media worker failed to start'); process.exit(1); });
