import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });

const DEV_ACCESS_SECRET = 'dev-access-secret-change-me-1234567890';
const DEV_REFRESH_SECRET = 'dev-refresh-secret-change-me-123456789';
const EXAMPLE_ACCESS_SECRET = 'replace-with-at-least-32-random-characters';
const EXAMPLE_REFRESH_SECRET = 'replace-with-another-at-least-32-random-secret';

const trustProxy = z.string().default('false').transform((value, ctx): false | number => {
  if (value === 'false' || value === '0') return false;
  const hops = Number(value);
  if (Number.isInteger(hops) && hops > 0 && hops <= 10) return hops;
  ctx.addIssue({ code: 'custom', message: 'TRUST_PROXY must be false or a hop count from 1 to 10' });
  return z.NEVER;
});

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WEB_PORT: z.coerce.number().default(3000),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/oremus'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32).default(DEV_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEV_REFRESH_SECRET),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: z.string().default('false').transform((value) => value === 'true'),
  TRUST_PROXY: trustProxy,
  FASTAPI_URL: z.string().url().default('http://localhost:8000'),
  APP_ORIGIN: z.string().default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  PLACES_URL: z.string().url().default('https://photon.komoot.io'),
  LOG_LEVEL: z.string().default('info'),
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  /** off: nothing scanned. shadow: scored and logged, no effect on users. enforce: decisions apply. */
  MODERATION_MODE: z.enum(['off', 'shadow', 'enforce', 'auto']).default('off'),
  MODERATION_URL: z.string().url().default('http://localhost:8010'),
  MODERATION_SECRET: z.string().default(''),
  // Signs ad impression and click tokens. Falls back to a key derived from the access secret.
  AD_TOKEN_SECRET: z.string().default(''),
  /** Lets members add credit to their own ad wallet for free. Unset: on, except in production. */
  ADS_SELF_TOPUP: z.enum(['true', 'false']).optional(),
  VNPAY_TMN_CODE: z.string().default(''),
  VNPAY_HASH_SECRET: z.string().default(''),
  VNPAY_HOST: z.string().url().default('https://sandbox.vnpayment.vn'),
  VNPAY_RETURN_URL: z.string().default(''),
  /** Browser-facing wss:// address of LiveKit. Calling is disabled while empty. */
  LIVEKIT_URL: z.string().default(''),
  LIVEKIT_API_KEY: z.string().default(''),
  LIVEKIT_API_SECRET: z.string().default(''),
  /** How this server reaches LiveKit's API. Defaults to LIVEKIT_URL; Compose points it at the internal address. */
  LIVEKIT_HOST: z.string().default(''),
  /** Pulse-style monitoring in the admin panel (src/monitoring). Off in tests unless asked for. */
  MONITORING_ENABLED: z.enum(['true', 'false']).optional(),
  MONITORING_SLOW_REQUEST_MS: z.coerce.number().int().positive().default(1000),
  MONITORING_SLOW_QUERY_MS: z.coerce.number().int().positive().default(100),
  MONITORING_SLOW_JOB_MS: z.coerce.number().int().positive().default(2000),
  MONITORING_SLOW_OUTGOING_MS: z.coerce.number().int().positive().default(1000)
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'production') return;
  const placeholders = new Set([DEV_ACCESS_SECRET, DEV_REFRESH_SECRET, EXAMPLE_ACCESS_SECRET, EXAMPLE_REFRESH_SECRET]);
  if (placeholders.has(value.JWT_ACCESS_SECRET)) ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'Production requires a unique JWT access secret' });
  if (placeholders.has(value.JWT_REFRESH_SECRET)) ctx.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'Production requires a unique JWT refresh secret' });
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) ctx.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'Access and refresh secrets must be different' });
  if (!value.COOKIE_SECURE) ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'Production requires COOKIE_SECURE=true' });
  if (value.TRUST_PROXY === false) ctx.addIssue({ code: 'custom', path: ['TRUST_PROXY'], message: 'Production requires an explicit trusted proxy hop count' });
  value.APP_ORIGIN.forEach((origin, index) => {
    if (new URL(origin).protocol !== 'https:') ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN', index], message: 'Production origins must use HTTPS' });
  });
});

export const parseEnv = (input: NodeJS.ProcessEnv) => schema.parse(input);
export const env = parseEnv(process.env);

