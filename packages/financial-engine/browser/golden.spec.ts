import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { runGoldenSuite } from '../src/golden/runner';

/**
 * ST-33.07: the golden suite gives the same output in a browser as in Node. The engine is bundled
 * the way a web app would ship it (esbuild, browser platform) and run in a blank page; the whole
 * output — every value, warning and default — is compared as one string.
 */
test('the golden suite is identical in the browser and in Node', async ({ page }) => {
  const bundle = await build({
    entryPoints: [join(__dirname, '../src/golden/runner.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'roshdGolden',
    target: 'es2022',
    write: false,
  });
  const script = bundle.outputFiles[0]?.text ?? '';
  expect(script.length).toBeGreaterThan(0);

  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: script });
  // Runs in the page; `globalThis` avoids needing DOM types in this Node-side file.
  const inBrowser = await page.evaluate(() =>
    (
      globalThis as unknown as { roshdGolden: { runGoldenSuite(): string } }
    ).roshdGolden.runGoldenSuite(),
  );

  const inNode = runGoldenSuite();
  expect(inBrowser.length).toBe(inNode.length);
  expect(inBrowser).toBe(inNode);
});
