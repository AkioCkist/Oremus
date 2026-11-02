import mongoose from 'mongoose';
import { instrumentMongo } from './instrument.js';
import { isMonitoring, startMonitoring, stopMonitoring } from './recorder.js';

export { recordCache, recordException, recordJob, requestMonitor } from './instrument.js';
export { stopMonitoring };

/**
 * Starts recording for this process once MongoDB and Redis are connected. `role` names the process on the
 * monitoring page (web, jobs, media); `extras` adds live figures to its heartbeat (open sockets, say).
 */
export function startProcessMonitoring(role: string, extras?: () => Record<string, unknown>): void {
  startMonitoring(role, { extras });
  if (isMonitoring()) instrumentMongo(mongoose.connection.getClient() as any);
}
