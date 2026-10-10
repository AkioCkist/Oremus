import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WEB_PORT: z.coerce.number().default(3000),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/oremus'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32).default('dev-access-secret-change-me-1234567890'),
  JWT_REFRESH_SECRET: z.string().min(32).default('dev-refresh-secret-change-me-123456789'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: z.string().default('false').transform((value) => value === 'true'),
  FASTAPI_URL: z.string().url().default('http://localhost:8000'),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info')
});

export const env = schema.parse(process.env);

