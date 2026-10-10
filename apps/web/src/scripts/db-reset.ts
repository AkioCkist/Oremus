import mongoose from 'mongoose';
import { connectInfrastructure, disconnectInfrastructure } from '../config/database.js';
import { env } from '../config/env.js';

/**
 * Drops the whole MongoDB database (local development only). Run `db:setup` afterwards to rebuild it.
 * Uploaded files and Redis are left alone.
 */
async function reset() {
  if (env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database.');
  if (!process.argv.includes('--yes')) {
    console.error(`This permanently deletes every document in ${env.MONGODB_URI}. Re-run with --yes to confirm.`);
    process.exitCode = 1;
    return;
  }
  await connectInfrastructure();
  const name = mongoose.connection.db!.databaseName;
  await mongoose.connection.dropDatabase();
  console.log(`Dropped database "${name}".`);
}

reset()
  .then(() => disconnectInfrastructure())
  .catch(async (error) => { console.error(error instanceof Error ? error.message : error); await disconnectInfrastructure(); process.exit(1); });
