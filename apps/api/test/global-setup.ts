import { execSync } from 'node:child_process';
import { Client } from 'pg';

/**
 * Prepares the dedicated e2e database once per run:
 * applies pending migrations (non-destructive), empties every application table, seeds reference data.
 * Refuses to run against any database whose name does not end with `_test`.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for e2e tests (see .env.example)');
  const database = new URL(url).pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) {
    throw new Error(`Refusing to use database "${database}" for e2e: its name must end with _test`);
  }

  const env = { ...process.env, DATABASE_URL: url };
  execSync('pnpm exec prisma migrate deploy', { env, stdio: 'inherit' });

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
      await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }

  execSync('pnpm exec prisma db seed', { env, stdio: 'inherit' });
}
