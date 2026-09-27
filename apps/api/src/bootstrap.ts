import { type INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { blockCrossSiteMutations } from './common/http/cross-site';
import { APP_CONFIG, type AppConfig } from './config/app-config';

export const API_PREFIX = 'api';

/**
 * Applies HTTP-level configuration shared by `main.ts` and the e2e tests,
 * so tests exercise exactly the production pipeline.
 */
export function configureApp(app: INestApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  const express = app as NestExpressApplication;

  const logger = app.get(Logger);
  app.useLogger(logger);
  if (config.NODE_ENV === 'production' && config.TRUST_PROXY === 0) {
    logger.warn(
      'TRUST_PROXY=0 in production: behind a reverse proxy every visitor shares one IP for rate limits and audit logs (see infra/nginx/README.md).',
    );
  }
  if (config.NODE_ENV === 'production' && !config.cookieSecure) {
    logger.warn(
      'COOKIE_SECURE=false in production: session cookies are sent over plain HTTP. Use it only for local testing.',
    );
  }
  express.set('trust proxy', config.TRUST_PROXY);
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '1mb' });
  // No urlencoded parser: every client sends JSON (uploads use multipart), and accepting form
  // bodies would let a cross-site HTML form post to the API (ST-26.02).
  app.use(helmet());
  app.use(blockCrossSiteMutations);
  app.use(cookieParser());

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
