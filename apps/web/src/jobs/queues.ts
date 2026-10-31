import { createHash } from 'node:crypto';
import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * BullMQ queues for background work other than video transcoding (see media/queue.ts for that).
 * Scoped by database like the media queue: a host-run dev worker and the Docker worker can share one Redis.
 */
const scope = createHash('sha1').update(env.MONGODB_URI).digest('hex').slice(0, 10);
export const JOB_PREFIX = `jobs:${scope}`;

export const QUEUES = { moderation: 'moderation', ads: 'ads', calls: 'calls' } as const;
export type QueueName = typeof QUEUES[keyof typeof QUEUES];

let connection: Redis | undefined;
/** BullMQ needs ioredis with retries disabled on blocking commands, so it cannot share the app's Redis client. */
export function jobConnection(): Redis {
  connection ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return connection;
}

const DEFAULTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  // Kept for a week so failures can be counted on the admin dashboard and retried.
  removeOnFail: { age: 7 * 86_400 }
};

const queues = new Map<QueueName, Queue>();
export function jobQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: jobConnection(), prefix: JOB_PREFIX, defaultJobOptions: DEFAULTS });
    queues.set(name, queue);
  }
  return queue;
}

export async function addJob(queue: QueueName, name: string, data: unknown, options: JobsOptions = {}): Promise<void> {
  await jobQueue(queue).add(name, data, options);
}

/** Waiting, active, delayed and failed counts per queue, for the admin dashboard. */
export async function queueHealth() {
  const entries = await Promise.all(Object.values(QUEUES).map(async (name) => [name, await jobQueue(name).getJobCounts('waiting', 'active', 'delayed', 'failed')] as const));
  return Object.fromEntries(entries);
}
