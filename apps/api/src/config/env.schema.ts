import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/**
 * Environment contract for the API. Every variable must also be documented in `.env.example`.
 * Boot fails fast when this schema does not validate.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Comma-separated origins allowed for CORS (non-browser/mobile clients). Web uses same-origin rewrites. */
  CORS_ORIGINS: csv.default([]),
  /** Express "trust proxy" setting; set to the number of proxies (e.g. 1 behind nginx). */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  SWAGGER_ENABLED: bool.optional(),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, { error: 'must be a postgresql:// connection string' }),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  /** Stricter per-IP limit for login/register/refresh within THROTTLE_TTL_MS. */
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(5),

  /** HS256 secret for access tokens (≥ 32 chars). Generate with: openssl rand -base64 48 */
  JWT_ACCESS_SECRET: z.string().min(32, { error: 'must be at least 32 characters' }),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** Defaults to true in production. */
  COOKIE_SECURE: bool.optional(),
  COOKIE_DOMAIN: z.string().optional(),

  /** Public origin of the web app (payment callbacks and post-payment redirects). */
  WEB_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .transform((v) => v.replace(/\/$/, ''))
    .default('http://localhost:3000'),
  /** Payment provider (OQ-09). Defaults: mock outside production, disabled in production. */
  PAYMENT_PROVIDER: z.enum(['disabled', 'mock']).optional(),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  /** Private directory for uploaded files; must not be web-served. */
  STORAGE_LOCAL_DIR: z.string().min(1).default('storage'),
  NOTIFICATION_DRIVER: z.enum(['log']).default('log'),
  /** HMAC secret for signed file-download URLs (≥ 32 chars, different from JWT secret). */
  FILE_URL_SECRET: z.string().min(32, { error: 'must be at least 32 characters' }),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
});

export type Env = z.infer<typeof envSchema>;
