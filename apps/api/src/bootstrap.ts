import { type INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from './config/app-config';

export const API_PREFIX = 'api';

/**
 * Applies HTTP-level configuration shared by `main.ts` and the e2e tests,
 * so tests exercise exactly the production pipeline.
 */
export function configureApp(app: INestApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  const express = app as NestExpressApplication;

  app.useLogger(app.get(Logger));
  express.set('trust proxy', config.TRUST_PROXY);
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '1mb' });
  express.useBodyParser('urlencoded', { extended: false, limit: '1mb' });
  app.use(helmet());

  if (config.CORS_ORIGINS.length > 0) {
    app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
  }

  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Roshd Afarinan Platform API')
        .setDescription('Versioned API. See docs/api/conventions.md for envelope and error model.')
        .setVersion('1')
        .addBearerAuth()
        .addCookieAuth('ra_at')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  return config;
}
