import { Emitter } from '@socket.io/redis-emitter';
import { Worker } from 'bullmq';
import { createClient } from 'redis';
import { connectInfrastructure, disconnectInfrastructure } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { moderationProcessor, onScanFailed } from './jobs/moderation.job.js';
import { adsProcessor } from './jobs/ads.job.js';
import { callsProcessor } from './jobs/calls.job.js';
import { JOB_PREFIX, jobConnection, jobQueue, QUEUES } from './jobs/queues.js';
import { setNotifier, setSessionTerminator } from './services/notification.service.js';
import { recordException, recordJob, startProcessMonitoring, stopMonitoring } from './monitoring/index.js';

/**
 * Background worker for everything except video transcoding. It holds no sockets of its own,
 * so realtime events go out through the same Redis channel the web servers listen on.
 */
async function start() {
  await connectInfrastructure();
  const publisher = createClient({ url: env.REDIS_URL });
  await publisher.connect();
  const emitter = new Emitter(publisher);
  setNotifier((userId, event, payload) => emitter.to(`user:${userId}`).emit(event, payload));
  setSessionTerminator((userId) => emitter.in(`user:${userId}`).disconnectSockets(true));

  const shared = { connection: jobConnection(), prefix: JOB_PREFIX };
  // One at a time: the moderation service runs inference serially, so more would only queue up there.
  const moderation = new Worker(QUEUES.moderation, moderationProcessor, { ...shared, concurrency: 1 });
  moderation.on('failed', (job, error) => { onScanFailed(job, error).catch((failure) => logger.error({ failure }, 'Could not settle a failed scan')); });
  const workers = [moderation, new Worker(QUEUES.ads, adsProcessor, shared), new Worker(QUEUES.calls, callsProcessor, { ...shared, concurrency: 10 })];
  workers.forEach((worker) => worker.on('error', (error) => logger.error({ error }, 'Job worker error')));
  startProcessMonitoring('jobs');
  // Duration from pick-up to finish, per queue and job name, for the monitoring page.
  const took = (job: { processedOn?: number; finishedOn?: number } | undefined) => (job?.processedOn ? (job.finishedOn ?? Date.now()) - job.processedOn : 0);
  workers.forEach((worker) => {
    worker.on('completed', (job) => recordJob(worker.name, job.name, took(job), false));
    worker.on('failed', (job, error) => { recordJob(worker.name, job?.name ?? 'unknown', took(job), true); recordException(error, { source: `job ${worker.name}:${job?.name ?? '?'}` }); });
  });

  await jobQueue(QUEUES.moderation).upsertJobScheduler('moderation-sweep', { every: 5 * 60_000 }, { name: 'sweep' });
  await jobQueue(QUEUES.ads).upsertJobScheduler('ads-settle', { every: 60_000 }, { name: 'settle' });
  await jobQueue(QUEUES.ads).upsertJobScheduler('ads-reconcile', { every: 15 * 60_000 }, { name: 'reconcile' });
  logger.info('Jobs worker is ready');

  const shutdown = async () => {
    logger.info('Jobs worker shutting down');
    await Promise.all(workers.map((worker) => worker.close()));
    await stopMonitoring();
    await publisher.quit();
    await disconnectInfrastructure();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}

start().catch((error) => { logger.fatal({ error }, 'Jobs worker failed to start'); process.exit(1); });
