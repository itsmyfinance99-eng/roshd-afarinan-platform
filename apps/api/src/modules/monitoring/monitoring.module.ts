import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { LogErrorReporter } from './adapters/log-error-reporter';
import { ERROR_REPORTER, type ErrorReporter } from './ports/error-reporter';

/** Error reporting (ST-25.08): the ErrorReporter port and the configured adapter. */
@Global()
@Module({
  providers: [
    {
      provide: ERROR_REPORTER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): ErrorReporter => {
        switch (config.ERROR_REPORTER_DRIVER) {
          case 'log':
            return new LogErrorReporter();
        }
      },
    },
  ],
  exports: [ERROR_REPORTER],
})
export class MonitoringModule {}
