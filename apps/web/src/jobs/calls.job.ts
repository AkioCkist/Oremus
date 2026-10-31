import type { Job } from 'bullmq';
import { logger } from '../config/logger.js';
import { onConnectTimeout, onRingTimeout } from '../services/call.service.js';

export async function callsProcessor(job: Job): Promise<void> {
  if (job.name === 'ring-timeout') return onRingTimeout(job.data.callId);
  if (job.name === 'connect-timeout') return onConnectTimeout(job.data.callId);
  logger.warn({ name: job.name }, 'Unknown calls job');
}
