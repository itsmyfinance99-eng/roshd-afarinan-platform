import { describe, expect, it } from 'vitest';
import { HealthRegistry } from './health.registry';

describe('HealthRegistry', () => {
  it('is ok with no checks registered', async () => {
    await expect(new HealthRegistry().readiness()).resolves.toEqual({ status: 'ok', checks: {} });
  });

  it('reports each check and fails when any is down', async () => {
    const registry = new HealthRegistry();
    registry.register('database', () => Promise.resolve());
    registry.register('storage', () => Promise.reject(new Error('unreachable')));
    await expect(registry.readiness()).resolves.toEqual({
      status: 'error',
      checks: { database: 'up', storage: 'down' },
    });
  });
});
