import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from './app-config';

const BASE = { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db' };

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
    expect(() => loadConfig({ DATABASE_URL: 'mysql://x' })).toThrow(ConfigValidationError);
  });
});
