import { envSchema, type Env } from './env.schema';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig extends Omit<Env, 'PAYMENT_PROVIDER'> {
  PAYMENT_PROVIDER: 'disabled' | 'mock';
  isProduction: boolean;
  isTest: boolean;
  swaggerEnabled: boolean;
  cookieSecure: boolean;
}

export class ConfigValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigValidationError';
  }
}

/** Secrets that must be different from each other and strong in production. */
const SECRET_VARS = ['JWT_ACCESS_SECRET', 'FILE_URL_SECRET', 'INTERNAL_API_TOKEN'] as const;

/** Values that are obviously placeholders, including the ones shipped in `.env.example`. */
const PLACEHOLDER = /change[-_ ]?me|dev[-_ ]?only|example|placeholder|secret{2,}|^0+$/i;

/** Distinct characters below this look like "aaaa…" or a short repeated pattern. */
const MIN_DISTINCT_CHARS = 12;

/**
 * Rejects weak or shared secrets in production (ST-26.03, finding F-08). A length check alone
 * accepted the `.env.example` placeholders, so anyone reading the repository could have signed
 * access tokens and file-download URLs.
 */
function secretIssues(config: Env): string[] {
  const issues: string[] = [];
  const seen = new Map<string, string>();
  for (const name of SECRET_VARS) {
    const value = config[name];
    if (!value) continue;
    if (PLACEHOLDER.test(value)) {
      issues.push(`${name}: looks like a placeholder; generate one with "openssl rand -base64 48"`);
    }
    if (new Set(value).size < MIN_DISTINCT_CHARS) {
      issues.push(`${name}: too few distinct characters; generate a random value`);
    }
    const twin = seen.get(value);
    if (twin) issues.push(`${name}: must differ from ${twin}`);
    else seen.set(value, name);
  }
  return issues;
}

/** Parses and validates configuration from an environment map. Never logs values (they may be secrets). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Treat empty strings as "unset" so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const config = result.data;
  const isProduction = config.NODE_ENV === 'production';
  const paymentProvider = config.PAYMENT_PROVIDER ?? (isProduction ? 'disabled' : 'mock');
  if (isProduction && paymentProvider === 'mock') {
    throw new ConfigValidationError([
      'PAYMENT_PROVIDER: the mock gateway is not allowed in production',
    ]);
  }
  if (isProduction) {
    const issues = secretIssues(config);
    if (issues.length > 0) throw new ConfigValidationError(issues);
  }
  return {
    ...config,
    PAYMENT_PROVIDER: paymentProvider,
    isProduction,
    isTest: config.NODE_ENV === 'test',
    swaggerEnabled: config.SWAGGER_ENABLED ?? !isProduction,
    cookieSecure: config.COOKIE_SECURE ?? isProduction,
  };
}
