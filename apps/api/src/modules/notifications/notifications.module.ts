import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { UsersModule } from '../users/users.module';
import { LogNotificationProvider } from './adapters/log-notification-provider';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_PROVIDER, type NotificationProvider } from './ports/notification-provider';

@Global()
@Module({
  imports: [UsersModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: NOTIFICATION_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): NotificationProvider => {
        switch (config.NOTIFICATION_DRIVER) {
          case 'log':
            return new LogNotificationProvider();
        }
      },
    },
  ],
  exports: [NOTIFICATION_PROVIDER, NotificationsService],
})
export class NotificationsModule {}
