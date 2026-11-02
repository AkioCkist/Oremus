import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Errors are logged under `error` throughout the app, and pino only knows how to print `err` by default (it would show {}).
  serializers: { error: pino.stdSerializers.err, failure: pino.stdSerializers.err },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'refreshToken']
});

