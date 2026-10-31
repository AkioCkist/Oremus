import { Emitter } from '@socket.io/redis-emitter';
import { Worker } from 'bullmq';
import { createClient } from 'redis';
import { connectInfrastructure, disconnectInfrastructure } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { moderationProcessor, onScanFailed } from './jobs/moderation.job.js';
import { JOB_PREFIX, jobConnection, jobQueue, QUEUES } from './jobs/queues.js';
import { setNotifier, setSessionTerminator } from './services/notification.service.js';

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
  const workers = [moderation];
  workers.forEach((worker) => worker.on('error', (error) => logger.error({ error }, 'Job worker error')));

  await jobQueue(QUEUES.moderation).upsertJobScheduler('moderation-sweep', { every: 5 * 60_000 }, { name: 'sweep' });
  logger.info('Jobs worker is ready');

  const shutdown = async () => {
    logger.info('Jobs worker shutting down');
    await Promise.all(workers.map((worker) => worker.close()));
    await publisher.quit();
    await disconnectInfrastructure();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}

start().catch((error) => { logger.fatal({ error }, 'Jobs worker failed to start'); process.exit(1); });
