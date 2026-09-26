import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { HealthRegistry } from '../health/health.registry';
import { LocalDiskStorage } from './adapters/local-disk-storage';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { MediaController } from './media.controller';
import { FILE_STORAGE, type FileStorageProvider } from './ports/file-storage';

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
export class FilesModule implements OnModuleInit {
  constructor(
    @Inject(FILE_STORAGE) private readonly storage: FileStorageProvider,
    private readonly health: HealthRegistry,
  ) {}

  onModuleInit(): void {
    this.health.register('storage', () => this.storage.healthCheck());
  }
}
