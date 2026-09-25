import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { EnvelopeInterceptor } from './common/http/envelope.interceptor';
import { resolveRequestId } from './common/http/request-id';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { AppConfigModule } from './config/config.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { skipUnlessAuthThrottled } from './modules/auth/auth-throttle';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './modules/database/database.module';
import { FilesModule } from './modules/files/files.module';
import { IranSahamdarModule } from './modules/iran-sahamdar/iran-sahamdar.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PermissionsGuard } from './modules/rbac/permissions.guard';
import { RbacModule } from './modules/rbac/rbac.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.LOG_LEVEL,
          genReqId: resolveRequestId,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              '*.password',
              '*.refreshToken',
              '*.accessToken',
            ],
            censor: '[REDACTED]',
          },
          autoLogging: { ignore: (req) => req.url?.includes('/health/') ?? false },
          transport:
            config.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          { name: 'default', ttl: config.THROTTLE_TTL_MS, limit: config.THROTTLE_LIMIT },
          {
            name: 'auth',
            ttl: config.THROTTLE_TTL_MS,
            limit: config.AUTH_THROTTLE_LIMIT,
            skipIf: skipUnlessAuthThrottled,
          },
        ],
      }),
    }),
    HealthModule,
    DatabaseModule,
    AuditModule,
    RbacModule,
    UsersModule,
    AuthModule,
    // Provider ports (ADR-0004)
    FilesModule,
    NotificationsModule,
    PaymentsModule,
    IranSahamdarModule,
  ],
  providers: [
    // Guard order matters: rate limit → authenticate (default deny) → authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
