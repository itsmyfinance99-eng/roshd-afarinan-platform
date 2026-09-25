import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * Web e2e (ADR-0006): smoke + interaction tests against the production build.
 * API calls are mocked per test with page.route(), so no backend is required.
 * Locally, set PLAYWRIGHT_CHANNEL=msedge (or chrome) to reuse an installed browser.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'fa-IR',
    trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
  ],
  webServer: {
    command: `pnpm exec next start --port ${PORT} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
