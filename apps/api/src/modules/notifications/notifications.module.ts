import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { LogNotificationProvider } from './adapters/log-notification-provider';
import { NOTIFICATION_PROVIDER, type NotificationProvider } from './ports/notification-provider';

@Global()
@Module({
  providers: [
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
  exports: [NOTIFICATION_PROVIDER],
})
export class NotificationsModule {}
