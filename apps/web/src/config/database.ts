import mongoose from 'mongoose';
import { createClient } from 'redis';
import { env } from './env.js';

export const redis = createClient({ url: env.REDIS_URL });

redis.on('error', (error) => console.error('Redis error', error));

export async function connectInfrastructure(): Promise<void> {
  // monitorCommands lets src/monitoring time every query; without a listener the events cost next to nothing.
  await Promise.all([mongoose.connect(env.MONGODB_URI, { autoIndex: env.NODE_ENV !== 'production', monitorCommands: true }), redis.connect()]);
}

export async function checkInfrastructure(): Promise<{ mongodb: 'ok'; redis: 'ok' }> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error('MongoDB is not connected');
  }
  await Promise.all([mongoose.connection.db.admin().ping(), redis.ping()]);
  return { mongodb: 'ok', redis: 'ok' };
}

export async function disconnectInfrastructure(): Promise<void> {
  await Promise.all([mongoose.disconnect(), redis.isOpen ? redis.quit() : Promise.resolve()]);
}

