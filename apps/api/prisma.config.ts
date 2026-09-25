import { defineConfig } from 'prisma/config';
import { loadEnvFile } from './src/config/load-env-file';

// Prisma 7 does not load .env automatically.
if (process.env.NODE_ENV !== 'production') loadEnvFile(__dirname);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` does not need a live database, so allow it to run without one.
    url: process.env.DATABASE_URL ?? 'postgresql://unset:unset@localhost:5432/unset',
  },
});
