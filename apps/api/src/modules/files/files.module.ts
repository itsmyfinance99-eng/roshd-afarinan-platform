import {
  Global,
  Inject,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { HealthRegistry } from '../health/health.registry';
import { LocalDiskStorage } from './adapters/local-disk-storage';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { MediaController } from './media.controller';
import { FILE_STORAGE, type FileStorageProvider } from './ports/file-storage';

/** How often unattached uploads are swept; the retention window decides what is old enough. */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * File management (EPIC-13): private uploads with content sniffing, signed download URLs
 * and attachment to business records, plus the public media library for content images. Storage is the configured FileStorageProvider
 * (local disk now; S3-compatible adapter after OQ-10).
 */
@Global()
@Module({
  controllers: [FilesController, MediaController],
  providers: [
    FilesService,
    {
      provide: FILE_STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): FileStorageProvider => {
        switch (config.STORAGE_DRIVER) {
          case 'local':
            return new LocalDiskStorage(config.STORAGE_LOCAL_DIR);
        }
      },
    },
  ],
  exports: [FILE_STORAGE, FilesService],
})
export class FilesModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FilesModule.name);
  private cleanup?: NodeJS.Timeout;

  constructor(
    @Inject(FILE_STORAGE) private readonly storage: FileStorageProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly files: FilesService,
    private readonly health: HealthRegistry,
  ) {}

  onModuleInit(): void {
    this.health.register('storage', () => this.storage.healthCheck());
    // Uploads nobody attached to a record are deleted on a schedule (ST-26.04, finding F-07).
    // Tests drive removeStaleUploads() directly; a timer there would leak between suites.
    if (this.config.UPLOAD_RETENTION_HOURS === 0 || this.config.isTest) return;
    this.cleanup = setInterval(() => void this.runCleanup(), CLEANUP_INTERVAL_MS);
    this.cleanup.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanup) clearInterval(this.cleanup);
  }

  private async runCleanup(): Promise<void> {
    try {
      await this.files.removeStaleUploads();
    } catch (error) {
      this.logger.warn({ err: error }, 'stale upload cleanup failed');
    }
  }
}
