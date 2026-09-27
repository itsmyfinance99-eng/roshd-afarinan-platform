import { Injectable } from '@nestjs/common';
import { withTimeout } from '../../common/time/with-timeout';

export type HealthCheck = () => Promise<void>;

export interface ReadinessReport {
  status: 'ok' | 'error';
  checks: Record<string, 'up' | 'down'>;
}

const CHECK_TIMEOUT_MS = 3_000;

/**
 * Modules register readiness checks (database, storage, external providers) at startup.
 * Keeps the health module independent of the modules it reports on.
 */
@Injectable()
export class HealthRegistry {
  private readonly checks = new Map<string, HealthCheck>();

  register(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }

  async readiness(): Promise<ReadinessReport> {
    const entries = await Promise.all(
      [...this.checks.entries()].map(async ([name, check]) => {
        try {
          await withTimeout(check(), CHECK_TIMEOUT_MS, `health check ${name}`);
          return [name, 'up'] as const;
        } catch {
          return [name, 'down'] as const;
        }
      }),
    );
    const checks = Object.fromEntries(entries);
    const status = entries.every(([, state]) => state === 'up') ? 'ok' : 'error';
    return { status, checks };
  }
}
