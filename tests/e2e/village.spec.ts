import { expect, test } from '@playwright/test';

test('first launch with empty IndexedDB shows the village', async ({ page }) => {
  // Each Playwright test gets a fresh browser context, so storage (IndexedDB, SW) starts empty.
  await page.goto('./');
  await expect(page.getByTestId('village-bg')).toBeVisible();
  await expect(page.getByTestId('villager').first()).toBeVisible();
  await expect(page.getByTestId('bells')).toHaveText('0');
  // background image really loaded
  const loaded = await page.getByTestId('village-bg').evaluate((el) => (el as HTMLImageElement).naturalWidth > 0);
  expect(loaded).toBe(true);
});

test('map button shows 7 islands, exactly 2 enabled', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('ちず').click();
  await expect(page.getByTestId('island')).toHaveCount(7);
  await expect(page.locator('[data-testid=island][aria-disabled=false]')).toHaveCount(2);
  await expect(page.locator('[data-testid=island][aria-disabled=true]')).toHaveCount(5);
});

test('footer link opens Credits', async ({ page }) => {
  await page.goto('./');
  await page.getByText('ライセンス・クレジット').click();
  await expect(page).toHaveURL(/#\/credits$/);
  await expect(page.getByText('JMdict')).toBeVisible();
});

test('village still shows after going offline and reloading', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // wait until the worker controls the page / precache is complete
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('village-bg')).toBeVisible();
  await expect(page.getByTestId('villager').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/village.png' });
});

test('island map renders in landscape and portrait (screenshots)', async ({ page }) => {
  await page.goto('./#/map');
  await expect(page.getByTestId('island')).toHaveCount(7);
  await page.screenshot({ path: 'test-results/map-landscape.png' });
  await page.setViewportSize({ width: 1024, height: 1366 });
  await expect(page.getByTestId('island').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/map-portrait.png' });
});

test('Credits has a big もどる button back to the village (screenshot)', async ({ page }) => {
  await page.goto('./');
  await page.getByText('ライセンス・クレジット').click();
  await expect(page).toHaveURL(/#\/credits$/);
  const back = page.getByTestId('credits-back');
  await expect(back).toBeVisible();
  const box = (await back.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(72);
  await page.screenshot({ path: 'test-results/credits.png' });
  await back.click();
  await expect(page.getByTestId('village-bg')).toBeVisible();
  await expect(page).toHaveURL(/#\/$|\/village-english\/$/);
});
