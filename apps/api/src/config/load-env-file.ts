import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Loads the nearest `.env` (walking up from cwd to the monorepo root) into process.env.
 * Existing environment variables always win. Used for local development only;
 * containers receive their configuration from the orchestrator.
 */
export function loadEnvFile(startDir = process.cwd()): string | undefined {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
