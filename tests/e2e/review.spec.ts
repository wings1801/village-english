import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

test('review page shows pictures and remembers decisions (screenshot)', async ({ page }) => {
  execSync('npm run build-review', { stdio: 'ignore' });
  const url = pathToFileURL(resolve('dist-review/index.html')).href;
  await page.goto(url);
  const imgs = page.locator('img.pic');
  expect(await imgs.count()).toBeGreaterThan(10);
  // every picture really loaded (relative path from dist-review/ to public/assets/emoji/)
  const broken = await imgs.evaluateAll((els) => els.filter((e) => (e as HTMLImageElement).naturalWidth === 0).length);
  expect(broken).toBe(0);
  await page.locator('.card').first().locator('button.approve').click();
  await expect(page.locator('#count')).toContainText('approved 1');
  await page.screenshot({ path: 'test-results/review.png' });
  await page.reload();
  await expect(page.locator('#count')).toContainText('approved 1');
});
