import { Inject, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { AuthModule } from '../auth/auth.module';
import { TokenRetentionService } from '../auth/token-retention.service';
import { NotificationsService } from '../notifications/notifications.service';

/** How often retention runs. The windows are days, so once a day is frequent enough. */
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** A short delay after boot, so a restart loop cannot turn into a delete loop. */
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Data retention (ST-27.03). Each context owns the deletion of its own records; this module only
 * decides when they run, and logs how much went — counts only, never a row.
 */
@Module({ imports: [AuthModule] })
export class MaintenanceModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceModule.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly tokens: TokenRetentionService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    // Tests drive run() directly; a timer there would delete rows other suites are using.
    if (this.config.isTest) return;
    if (this.config.TOKEN_RETENTION_DAYS === 0 && this.config.NOTIFICATION_RETENTION_DAYS === 0) {
      return;
    }
    this.schedule(setTimeout(() => void this.run(), FIRST_RUN_DELAY_MS));
    this.schedule(setInterval(() => void this.run(), RUN_INTERVAL_MS));
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  /** One retention pass. Returns what it deleted so a test (or an operator) can check. */
  async run(now = new Date()): Promise<{ tokens?: unknown; notifications?: number }> {
    const result: { tokens?: unknown; notifications?: number } = {};
    const tokenDays = this.config.TOKEN_RETENTION_DAYS;
    const notificationDays = this.config.NOTIFICATION_RETENTION_DAYS;
    try {
      if (tokenDays > 0) {
        result.tokens = await this.tokens.purge(new Date(now.getTime() - tokenDays * DAY_MS));
      }
      if (notificationDays > 0) {
        result.notifications = await this.notifications.purgeOldRead(
          new Date(now.getTime() - notificationDays * DAY_MS),
        );
      }
      this.logger.log(result, 'retention pass complete');
    } catch (error) {
      this.logger.warn({ err: error }, 'retention pass failed');
    }
    return result;
  }

  private schedule(timer: NodeJS.Timeout): void {
    timer.unref();
    this.timers.push(timer);
  }
}
