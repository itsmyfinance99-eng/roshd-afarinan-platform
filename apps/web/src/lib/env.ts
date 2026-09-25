/** Public runtime configuration (NEXT_PUBLIC_* are inlined at build time). */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);

/** Shows the "prototype / demo data" notice in the header (design conflict C3). */
export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';

/** Server-side base URL of the API (server components and route rewrites). */
export const apiInternalUrl = (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000').replace(
  /\/$/,
  '',
);
