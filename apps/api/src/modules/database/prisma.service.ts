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
    super({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL }) });
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
