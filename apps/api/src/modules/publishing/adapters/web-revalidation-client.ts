import { Logger } from '@nestjs/common';
import { withTimeout } from '../../../common/time/with-timeout';
import { SITE_CACHE_TIMEOUT_MS, type SiteCache, type SiteCacheTag } from '../ports/site-cache';

/**
 * Asks the Next.js site to drop the cache entries carrying these tags. The shared
 * `INTERNAL_API_TOKEN` authenticates the call; the site refuses anything else, so this endpoint
 * cannot be used from outside to make the site rebuild on demand.
 */
export class WebRevalidationClient implements SiteCache {
  readonly driver = 'web';
  private readonly logger = new Logger(WebRevalidationClient.name);

  constructor(
    private readonly webBaseUrl: string,
    private readonly token: string,
  ) {}

  async invalidate(tags: readonly SiteCacheTag[]): Promise<void> {
    if (tags.length === 0) return;
    try {
      const response = await withTimeout(
        fetch(`${this.webBaseUrl}/internal/revalidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-token': this.token },
          body: JSON.stringify({ tags }),
        }),
        SITE_CACHE_TIMEOUT_MS,
        'site cache invalidate',
      );
      if (!response.ok) {
        this.logger.warn({ status: response.status, tags }, 'site cache invalidation refused');
      }
    } catch (error) {
      // The editor's change is saved either way; the page refreshes on its ISR schedule.
      this.logger.warn({ err: error, tags }, 'site cache invalidation failed');
    }
  }
}

/** Used when no web URL or no internal token is configured (local API-only work, tests). */
export class NoopSiteCache implements SiteCache {
  readonly driver = 'noop';
  invalidate(): Promise<void> {
    return Promise.resolve();
  }
}
