import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectInfrastructure, disconnectInfrastructure } from '../config/database.js';
import { env } from '../config/env.js';
import '../models/index.js';
import { assertWipeAllowed, describeCacheWipe, wipeRedis } from './wipe-cache.js';

/**
 * Returns the app to a brand-new, empty state:
 *   1. drops the MongoDB database (users, posts, messages, groups, stories, sessions…),
 *   2. recreates every collection's indexes so the app works immediately without `db:migrate`,
 *   3. deletes every uploaded file in `uploads/` (keeps `.gitkeep`).
 * With `--cache` it also flushes the whole Redis database (same as `wipe:cache -- --yes --all`).
 *
 * `wipe:data -- --yes`          data + uploads
 * `wipe:data -- --yes --cache`  data + uploads + Redis
 * Refuses when NODE_ENV=production unless `--allow-production` is also given.
 */

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const KEEP = new Set(['.gitkeep']);

async function wipeUploads(): Promise<number> {
  let entries: string[];
  try { entries = await fs.readdir(UPLOADS_DIR); } catch { return 0; }
  const doomed = entries.filter((name) => !KEEP.has(name));
  await Promise.all(doomed.map((name) => fs.rm(path.join(UPLOADS_DIR, name), { recursive: true, force: true })));
  return doomed.length;
}

async function wipe() {
  const withCache = process.argv.includes('--cache');
  const target = `every document in ${env.MONGODB_URI} and every file in ${UPLOADS_DIR}${withCache ? `, plus every key in Redis ${env.REDIS_URL}` : ''}`;
  if (!assertWipeAllowed(`This permanently deletes ${target}.`)) return;

  await connectInfrastructure();
  const name = mongoose.connection.db!.databaseName;
  await mongoose.connection.dropDatabase();
  console.log(`Dropped database "${name}".`);

  const modelNames = mongoose.modelNames();
  for (const model of modelNames) await mongoose.model(model).syncIndexes();
  console.log(`Recreated indexes for ${modelNames.length} empty collections.`);

  console.log(`Deleted ${await wipeUploads()} uploaded files.`);

  if (withCache) console.log(describeCacheWipe(await wipeRedis(true)));
  console.log('Done. The app is now empty: register a new account, or run `npm run seed` for sample data.');
}

wipe()
  .then(() => disconnectInfrastructure())
  .catch(async (error) => { console.error(error instanceof Error ? error.message : error); await disconnectInfrastructure(); process.exit(1); });
