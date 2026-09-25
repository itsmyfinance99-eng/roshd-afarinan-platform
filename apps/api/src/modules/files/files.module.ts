import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { HealthRegistry } from '../health/health.registry';
import { LocalDiskStorage } from './adapters/local-disk-storage';
import { FILE_STORAGE, type FileStorageProvider } from './ports/file-storage';

/**
 * Provides the configured FileStorageProvider. The FileObject entity, upload validation
 * and signed URLs arrive in EPIC-13; an S3-compatible adapter follows OQ-10.
 */
@Global()
@Module({
  providers: [
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
  exports: [FILE_STORAGE],
})
export class FilesModule implements OnModuleInit {
  constructor(
    @Inject(FILE_STORAGE) private readonly storage: FileStorageProvider,
    private readonly health: HealthRegistry,
  ) {}

  onModuleInit(): void {
    this.health.register('storage', () => this.storage.healthCheck());
  }
}
