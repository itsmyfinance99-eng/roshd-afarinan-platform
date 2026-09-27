import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { PrismaClient } from '../../generated/prisma/client';
import { HealthRegistry } from '../health/health.registry';

/**
 * Single Prisma client for the process. Only a module's own services may use its models
 * (see docs/architecture/backend.md); cross-module access goes through exported services.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly health: HealthRegistry,
  ) {
    // Without these the pg pool waits forever for a connection and a statement never gives up,
    // so a stalled database turns every request into a hanging one (ST-26.05, finding F-13).
    super({
      adapter: new PrismaPg({
        connectionString: config.DATABASE_URL,
        max: config.DATABASE_POOL_SIZE,
        connectionTimeoutMillis: config.DATABASE_CONNECT_TIMEOUT_MS,
        statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
        query_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    this.health.register('database', async () => {
      await this.$queryRaw`SELECT 1`;
    });
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
