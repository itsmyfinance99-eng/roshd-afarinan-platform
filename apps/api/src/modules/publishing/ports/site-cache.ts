export const SITE_CACHE = Symbol('SITE_CACHE');

/**
 * The public site caches its pages (ISR), so an editorial change is only visible once that cache
 * is dropped. Every published collection is read under a tag, and this port asks the site to
 * forget those tags (ST-27.04, phase-1 QA report row 7).
 *
 * Invalidation is best-effort by contract: the editor's change is already saved, so a site that
 * cannot be reached must never fail the request — the page then refreshes on its own schedule.
 */
export type SiteCacheTag = 'content' | 'pages' | 'courses' | 'research' | 'investments';

export interface SiteCache {
  readonly driver: string;
  /** Must settle within `SITE_CACHE_TIMEOUT_MS` and must not throw for the caller. */
  invalidate(tags: readonly SiteCacheTag[]): Promise<void>;
}

/** Bounded like every other outbound call (ST-26.10, findings I-07 and I-08). */
export const SITE_CACHE_TIMEOUT_MS = 3_000;
