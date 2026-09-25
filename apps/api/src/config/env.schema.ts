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
});

export type Env = z.infer<typeof envSchema>;
