import type { Job } from 'bullmq';
import { logger } from '../config/logger.js';
import { reconcileAccounts, settleAdSpend } from '../services/ads.service.js';

export async function adsProcessor(job: Job): Promise<void> {
  if (job.name === 'settle') { await settleAdSpend(); return; }
  if (job.name === 'reconcile') {
    const repaired = await reconcileAccounts();
    if (repaired) logger.warn({ repaired }, 'Repaired ad wallets');
    return;
  }
  logger.warn({ name: job.name }, 'Unknown ads job');
}
