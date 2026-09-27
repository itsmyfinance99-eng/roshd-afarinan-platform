import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { NoopSiteCache, WebRevalidationClient } from './adapters/web-revalidation-client';
import { SITE_CACHE, type SiteCache } from './ports/site-cache';

/**
 * Publishing side effects (ST-27.04): telling the public site that a published collection
 * changed. Global, because every content module needs it and none of them should import another.
 */
@Global()
@Module({
  providers: [
    {
      provide: SITE_CACHE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): SiteCache =>
        config.INTERNAL_API_TOKEN
          ? new WebRevalidationClient(config.WEB_BASE_URL, config.INTERNAL_API_TOKEN)
          : new NoopSiteCache(),
    },
  ],
  exports: [SITE_CACHE],
})
export class PublishingModule {}
