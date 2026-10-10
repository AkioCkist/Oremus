import mongoose from 'mongoose';
import { connectInfrastructure, disconnectInfrastructure } from '../config/database.js';
import { migrations } from '../migrations/index.js';
import '../models/index.js';

type MigrationRecord = { _id: string; description?: string; completedAt: Date; durationMs?: number; result?: string };

/**
 * `migrate`          sync indexes for every model, then run pending data migrations in order.
 * `migrate --status` list applied / pending migrations without changing anything.
 * Safe to run any number of times.
 */
async function migrate() {
  const statusOnly = process.argv.includes('--status');
  await connectInfrastructure();
  const records = mongoose.connection.db!.collection<MigrationRecord>('migrations');
  const applied = new Map((await records.find().toArray()).map((record) => [record._id, record]));
  const pending = migrations.filter((migration) => !applied.has(migration.id));

  if (statusOnly) {
    for (const migration of migrations) {
      const record = applied.get(migration.id);
      console.log(`${record ? 'applied' : 'pending'}  ${migration.id}${record ? `  (${record.completedAt.toISOString()})` : ''}`);
    }
    console.log(`${migrations.length - pending.length} applied, ${pending.length} pending.`);
    return;
  }

  // Every registered model, so new collections can't be forgotten (production runs with autoIndex off).
  const modelNames = mongoose.modelNames();
  for (const name of modelNames) await mongoose.model(name).syncIndexes();
  console.log(`Synchronized indexes for ${modelNames.length} collections.`);

  for (const migration of pending) {
    const started = Date.now();
    console.log(`Running ${migration.id}: ${migration.description}`);
    const result = (await migration.up()) || '';
    const durationMs = Date.now() - started;
    await records.updateOne({ _id: migration.id }, { $setOnInsert: { description: migration.description, completedAt: new Date(), durationMs, result } }, { upsert: true });
    console.log(`  done in ${durationMs} ms${result ? ` — ${result}` : ''}`);
  }
  console.log(pending.length ? `Applied ${pending.length} migration(s).` : 'No pending migrations.');
}

migrate()
  .then(() => disconnectInfrastructure())
  .catch(async (error) => { console.error(error); await disconnectInfrastructure(); process.exit(1); });
