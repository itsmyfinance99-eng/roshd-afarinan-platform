import { envSchema, type Env } from './env.schema';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig extends Env {
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
  return {
    ...config,
    isProduction,
    isTest: config.NODE_ENV === 'test',
    swaggerEnabled: config.SWAGGER_ENABLED ?? !isProduction,
    cookieSecure: config.COOKIE_SECURE ?? isProduction,
  };
}
