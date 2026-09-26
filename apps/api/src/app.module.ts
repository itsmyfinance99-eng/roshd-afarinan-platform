import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { EnvelopeInterceptor } from './common/http/envelope.interceptor';
import { resolveRequestId } from './common/http/request-id';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { AppConfigModule } from './config/config.module';
import { AuditLogModule } from './modules/audit/audit-log.module';
import { AuditModule } from './modules/audit/audit.module';
import { CmsModule } from './modules/cms/cms.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { skipUnlessStrictThrottled } from './common/http/strict-rate-limit';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DatabaseModule } from './modules/database/database.module';
import { FilesModule } from './modules/files/files.module';
import { InvestmentModule } from './modules/investment/investment.module';
import { IranSahamdarModule } from './modules/iran-sahamdar/iran-sahamdar.module';
import { LearningModule } from './modules/learning/learning.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PermissionsGuard } from './modules/rbac/permissions.guard';
import { RbacModule } from './modules/rbac/rbac.module';
import { ResearchModule } from './modules/research/research.module';
import { ServiceRequestsModule } from './modules/service-requests/service-requests.module';
import { TicketsModule } from './modules/tickets/tickets.module';
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
            name: 'strict',
            ttl: config.THROTTLE_TTL_MS,
            limit: config.AUTH_THROTTLE_LIMIT,
            skipIf: skipUnlessStrictThrottled,
          },
        ],
      }),
    }),
    HealthModule,
    DatabaseModule,
    AuditModule,
    AuditLogModule,
    RbacModule,
    UsersModule,
    AuthModule,
    // Provider ports (ADR-0004)
    FilesModule,
    NotificationsModule,
    PaymentsModule,
    IranSahamdarModule,
    // Domain modules (Phase 1)
    ServiceRequestsModule,
    CmsModule,
    LearningModule,
    ResearchModule,
    InvestmentModule,
    TicketsModule,
    DashboardModule,
    OrdersModule,
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
