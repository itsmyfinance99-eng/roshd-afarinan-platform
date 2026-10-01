import { expect, test } from '@playwright/test';

// The motion layer (design/claude-design/prototype/motion.js) with animations switched on.
test.use({ reducedMotion: 'no-preference' });

test.describe('motion layer', () => {
  test('home intro plays once per session and can be skipped', async ({ page }) => {
    await page.goto('/');
    const skip = page.getByRole('button', { name: 'رد شدن' });
    await expect(skip).toBeVisible();
    await skip.click();
    await expect(skip).toBeHidden();
    await expect(page.locator('html')).not.toHaveClass(/ra-intro/);

    // Same session: no intro on the next visit.
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'رد شدن' })).toHaveCount(0);
  });

  test('revealed blocks become visible as they scroll in', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('ra-intro-seen', '1'));
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/ra-motion/);
    const journeys = page.getByRole('region', { name: 'چهار مسیر اصلی' });
    await journeys.scrollIntoViewIfNeeded();
    const tile = journeys.locator('a[href="/training"]');
    await expect(tile).toHaveAttribute('data-shown', /.*/);
    await expect(tile).toHaveCSS('opacity', '1');
  });

  test('reduced motion shows the static end state and no intro', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveClass(/ra-motion/);
    await expect(page.getByRole('button', { name: 'رد شدن' })).toHaveCount(0);
    const tile = page.locator('a[href="/research"]').first();
    await expect(tile).toHaveCSS('opacity', '1');
    await context.close();
  });
});
