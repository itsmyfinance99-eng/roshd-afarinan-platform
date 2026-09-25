import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from './app-config';

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(4000);
    expect(config.CORS_ORIGINS).toEqual([]);
    expect(config.swaggerEnabled).toBe(true);
  });

  it('disables swagger in production unless explicitly enabled', () => {
    expect(loadConfig({ NODE_ENV: 'production' }).swaggerEnabled).toBe(false);
    expect(loadConfig({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).swaggerEnabled).toBe(
      true,
    );
  });

  it('parses comma-separated CORS origins', () => {
    expect(loadConfig({ CORS_ORIGINS: 'https://a.ir, https://b.ir,' }).CORS_ORIGINS).toEqual([
      'https://a.ir',
      'https://b.ir',
    ]);
  });

  it('treats empty strings as unset', () => {
    expect(loadConfig({ PORT: '' }).PORT).toBe(4000);
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
  });
});
