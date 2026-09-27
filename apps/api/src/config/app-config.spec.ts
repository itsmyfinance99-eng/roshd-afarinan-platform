import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from './app-config';

/** Random-looking values: production also checks that secrets are strong and distinct. */
const JWT_SECRET = 'Jv7pQ2mK9xR4tB6wZ8nL3sY5cF1hD0gA-jw';
const FILE_SECRET = 'Ht4kM8zP1vC6qX3bN9rW5yJ2sG7dL0fE-fu';
const INTERNAL_TOKEN = 'Qs9wE2rT5yU8iO1pA4sD7fG0hJ3kL6zX-in';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
  JWT_ACCESS_SECRET: JWT_SECRET,
  FILE_URL_SECRET: FILE_SECRET,
};

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig(BASE);
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(4000);
    expect(config.CORS_ORIGINS).toEqual([]);
    expect(config.swaggerEnabled).toBe(true);
  });

  it('disables swagger in production unless explicitly enabled', () => {
    expect(loadConfig({ ...BASE, NODE_ENV: 'production' }).swaggerEnabled).toBe(false);
    expect(
      loadConfig({ ...BASE, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).swaggerEnabled,
    ).toBe(true);
  });

  it('parses comma-separated CORS origins', () => {
    expect(
      loadConfig({ ...BASE, CORS_ORIGINS: 'https://a.ir, https://b.ir,' }).CORS_ORIGINS,
    ).toEqual(['https://a.ir', 'https://b.ir']);
  });

  it('treats empty strings as unset', () => {
    expect(loadConfig({ ...BASE, PORT: '' }).PORT).toBe(4000);
  });

  it('fails fast with every invalid variable listed', () => {
    let error: unknown;
    try {
      loadConfig({ PORT: 'abc', NODE_ENV: 'staging' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigValidationError);
    const issues = (error as ConfigValidationError).issues.join('\n');
    expect(issues).toContain('PORT');
    expect(issues).toContain('NODE_ENV');
    expect(issues).toContain('DATABASE_URL');
  });

  it('rejects non-postgres database URLs', () => {
    expect(() => loadConfig({ ...BASE, DATABASE_URL: 'mysql://x' })).toThrow(ConfigValidationError);
  });

  it('requires a strong JWT secret and secures cookies in production', () => {
    expect(() => loadConfig({ ...BASE, JWT_ACCESS_SECRET: 'short' })).toThrow(
      ConfigValidationError,
    );
    expect(loadConfig(BASE).cookieSecure).toBe(false);
    expect(loadConfig({ ...BASE, NODE_ENV: 'production' }).cookieSecure).toBe(true);
  });

  it('requires a long internal API token when one is set', () => {
    expect(() => loadConfig({ ...BASE, INTERNAL_API_TOKEN: 'short' })).toThrow(
      ConfigValidationError,
    );
    expect(loadConfig({ ...BASE, INTERNAL_API_TOKEN: INTERNAL_TOKEN }).INTERNAL_API_TOKEN).toBe(
      INTERNAL_TOKEN,
    );
    expect(loadConfig(BASE).INTERNAL_API_TOKEN).toBeUndefined();
  });

  it('never allows the mock payment gateway in production', () => {
    expect(loadConfig(BASE).PAYMENT_PROVIDER).toBe('mock');
    expect(loadConfig({ ...BASE, NODE_ENV: 'production' }).PAYMENT_PROVIDER).toBe('disabled');
    expect(() => loadConfig({ ...BASE, NODE_ENV: 'production', PAYMENT_PROVIDER: 'mock' })).toThrow(
      ConfigValidationError,
    );
  });

  // ST-26.03 (F-08): a length check alone accepted the .env.example placeholders.
  describe('secret strength in production', () => {
    const prod = (extra: Record<string, string>) =>
      loadConfig({ ...BASE, NODE_ENV: 'production', ...extra });

    it('accepts distinct, random-looking secrets', () => {
      expect(prod({ INTERNAL_API_TOKEN: INTERNAL_TOKEN }).isProduction).toBe(true);
    });

    it.each([
      ['placeholder', 'change-me-dev-only-secret-at-least-32-characters'],
      ['example wording', 'example-secret-value-for-local-development-only'],
      ['repeated character', 'a'.repeat(48)],
      ['short alphabet', 'abcabcabcabcabcabcabcabcabcabcabcabc'],
    ])('refuses a %s secret', (_name, value) => {
      expect(() => prod({ JWT_ACCESS_SECRET: value })).toThrow(ConfigValidationError);
      expect(() => prod({ FILE_URL_SECRET: value })).toThrow(ConfigValidationError);
      expect(() => prod({ INTERNAL_API_TOKEN: value })).toThrow(ConfigValidationError);
    });

    it('refuses secrets reused across variables', () => {
      expect(() => prod({ FILE_URL_SECRET: JWT_SECRET })).toThrow(ConfigValidationError);
      expect(() => prod({ INTERNAL_API_TOKEN: JWT_SECRET })).toThrow(ConfigValidationError);
    });

    it('names the offending variable and never prints its value', () => {
      let error: ConfigValidationError | undefined;
      try {
        prod({ JWT_ACCESS_SECRET: 'change-me-dev-only-secret-at-least-32-characters' });
      } catch (e) {
        error = e as ConfigValidationError;
      }
      const issues = error?.issues.join('\n') ?? '';
      expect(issues).toContain('JWT_ACCESS_SECRET');
      expect(issues).not.toContain('change-me-dev-only');
    });

    it('leaves development and test alone', () => {
      expect(() => loadConfig({ ...BASE, JWT_ACCESS_SECRET: 'a'.repeat(48) })).not.toThrow();
      expect(() =>
        loadConfig({ ...BASE, NODE_ENV: 'test', JWT_ACCESS_SECRET: 'a'.repeat(48) }),
      ).not.toThrow();
    });
  });
});
