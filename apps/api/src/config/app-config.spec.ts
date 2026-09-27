import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from './app-config';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  FILE_URL_SECRET: 'f'.repeat(32),
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
    expect(
      loadConfig({ ...BASE, INTERNAL_API_TOKEN: 'x'.repeat(32) }).INTERNAL_API_TOKEN,
    ).toHaveLength(32);
    expect(loadConfig(BASE).INTERNAL_API_TOKEN).toBeUndefined();
  });

  it('never allows the mock payment gateway in production', () => {
    expect(loadConfig(BASE).PAYMENT_PROVIDER).toBe('mock');
    expect(loadConfig({ ...BASE, NODE_ENV: 'production' }).PAYMENT_PROVIDER).toBe('disabled');
    expect(() => loadConfig({ ...BASE, NODE_ENV: 'production', PAYMENT_PROVIDER: 'mock' })).toThrow(
      ConfigValidationError,
    );
  });

  // ST-26.08 (F-11): a hop count trusts any forwarded header when the API is also reachable
  // directly; a list names which proxies may be believed.
  describe('TRUST_PROXY', () => {
    it('accepts a hop count', () => {
      expect(loadConfig({ ...BASE, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
      expect(loadConfig(BASE).TRUST_PROXY).toBe(0);
    });

    it('accepts a list of trusted addresses', () => {
      expect(loadConfig({ ...BASE, TRUST_PROXY: 'loopback, 172.16.0.0/12' }).TRUST_PROXY).toEqual([
        'loopback',
        '172.16.0.0/12',
      ]);
    });

    it('refuses an empty entry', () => {
      expect(() => loadConfig({ ...BASE, TRUST_PROXY: 'loopback,,10.0.0.1' })).toThrow(
        ConfigValidationError,
      );
    });
  });
});
