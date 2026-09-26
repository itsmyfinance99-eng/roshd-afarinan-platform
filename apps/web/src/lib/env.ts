/** Public runtime configuration (NEXT_PUBLIC_* are inlined at build time). */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);

/** Shows the "prototype / demo data" notice in the header (design conflict C3). */
export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';

/**
 * The payment simulator page (/mock-gateway) exists only for development and tests. Production
 * builds serve it only when ENABLE_MOCK_GATEWAY=true (demo servers with PAYMENT_PROVIDER=mock).
 */
export const mockGatewayEnabled = (): boolean =>
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_MOCK_GATEWAY === 'true';

/** Server-side base URL of the API (server components and route rewrites). */
export const apiInternalUrl = (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000').replace(
  /\/$/,
  '',
);
