import { defineConfig, devices } from '@playwright/test';

/**
 * Browser run of the engine's golden suite (ST-33.07): the engine is bundled for the browser and
 * must produce byte for byte the same output as in Node. No web server is needed.
 * Locally, set PLAYWRIGHT_CHANNEL=msedge (or chrome) to reuse an installed browser.
 */
export default defineConfig({
  testDir: './browser',
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
  ],
});
