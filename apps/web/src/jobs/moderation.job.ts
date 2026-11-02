import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { scoreImage, scoreText, type Scores } from '../moderation/client.js';
import { sweepQuarantine } from '../moderation/quarantine.js';
import { checkRules } from '../moderation/rules.js';
import { Comment, Post, Story } from '../models/index.js';
import { addJob, QUEUES } from './queues.js';
import { applyScan, decide, failOpen, loadPolicy, loadTarget, recordScan, SCAN_JOB, type TargetType } from '../services/moderation.service.js';

const UPLOADS = path.resolve(process.cwd(), 'uploads');
const MODEL_INPUT_PX = 384;
const VIDEO_FRAMES = 5;
// A rule match always reaches a person, however confident the model is that the text is fine.
const RULE_FLOOR = 0.75;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv|avi)$/i;
const STUCK_MS = 10 * 60_000;

export type ScanJob = { targetType: TargetType; targetId: string };

const localFile = (url: string) => (url.startsWith('/uploads/') ? path.join(UPLOADS, path.basename(url)) : null);

async function extractFrames(file: string): Promise<Buffer[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-'));
  try {
    await new Promise<void>((resolve, reject) => {
      // Spread across the video: a frame every five seconds, capped, so scanning cost stays flat for long uploads.
      const child = spawn(env.FFMPEG_PATH, ['-v', 'error', '-i', file, '-vf', `fps=1/5,scale=${MODEL_INPUT_PX}:-2`, '-frames:v', String(VIDEO_FRAMES), path.join(dir, '%d.jpg')], { stdio: 'ignore' });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
    });
    const names = await fs.readdir(dir);
    return Promise.all(names.map((name) => fs.readFile(path.join(dir, name))));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Images to score for one upload: the picture itself, or frames for a video. Files that are gone are skipped. */
async function imagesOf(url: string): Promise<Buffer[]> {
  const file = localFile(url);
  if (!file || !(await fs.stat(file).catch(() => null))) return [];
  if (VIDEO_EXT.test(file)) return extractFrames(file);
  return [await sharp(file, { failOn: 'none' }).rotate().resize(MODEL_INPUT_PX, MODEL_INPUT_PX, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 80 }).toBuffer()];
}

const mergeMax = (into: Scores, from: Scores) => { for (const [key, value] of Object.entries(from)) into[key] = Math.max(into[key] ?? 0, value); };

export async function scanTarget({ targetType, targetId }: ScanJob): Promise<void> {
  const target = await loadTarget(targetType, targetId);
  if (!target) return;
  const scores: Scores = {};
  const models = new Set<string>();
  if (target.text.trim()) {
    const result = await scoreText(target.text);
    mergeMax(scores, result.categories);
    result.models.forEach((model) => models.add(model));
  }
  for (const url of target.mediaUrls) {
    for (const image of await imagesOf(url)) {
      const result = await scoreImage(image);
      mergeMax(scores, result.categories);
      result.models.forEach((model) => models.add(model));
    }
  }
  const rules = checkRules(target.text);
  for (const category of rules.categories) scores[category] = Math.max(scores[category] ?? 0, RULE_FLOOR);
  const { decision, categories } = decide(scores, await loadPolicy());
  const shadow = env.MODERATION_MODE !== 'enforce';
  await recordScan({ targetType, targetId, authorId: target.authorId, scores, decision, categories, models: [...models], ruleMatches: rules.matches, shadow });
  if (shadow) return;
  await applyScan(targetType, targetId, { decision, categories, scores, models: [...models], source: rules.categories.length ? 'rule' : 'ai' });
}

export async function moderationProcessor(job: Job): Promise<void> {
  if (job.name === 'scan') return scanTarget(job.data as ScanJob);
  if (job.name === 'sweep') return sweep();
  logger.warn({ name: job.name }, 'Unknown moderation job');
}

/** Called once a scan has used up its retries. */
export async function onScanFailed(job: Job | undefined, error: Error): Promise<void> {
  if (!job || job.name !== 'scan' || job.attemptsMade < (job.opts.attempts ?? 1)) return;
  logger.error({ error, data: job.data }, 'Scan failed for good; publishing and leaving it for review');
  const { targetType, targetId } = job.data as ScanJob;
  await failOpen(targetType, targetId);
}

/** Re-queues content stuck waiting for a scan (a lost job, a Redis flush) and clears expired quarantine files. */
async function sweep(): Promise<void> {
  const before = new Date(Date.now() - STUCK_MS);
  const stuck: Array<[TargetType, any]> = [['Post', Post], ['Comment', Comment], ['Story', Story]];
  for (const [targetType, model] of stuck) {
    const rows: any[] = await model.find({ moderationStatus: { $in: ['pending', 'held'] }, updatedAt: { $lt: before }, deletedAt: null }).select('_id').limit(200).lean();
    // The fixed job id means a scan that is still queued is not queued twice.
    await Promise.all(rows.map((row) => addJob(QUEUES.moderation, 'scan', { targetType, targetId: String(row._id) }, { ...SCAN_JOB, jobId: `rescan-${row._id}` })));
    if (rows.length) logger.warn({ targetType, count: rows.length }, 'Re-queued stuck moderation scans');
  }
  const removed = await sweepQuarantine();
  if (removed) logger.info({ removed }, 'Deleted expired quarantined files');
}
