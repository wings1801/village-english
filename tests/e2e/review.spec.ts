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

test('filters and bulk buttons act only on the shown questions (screenshot)', async ({ page }) => {
  execSync('npm run build-review', { stdio: 'ignore' });
  await page.goto(pathToFileURL(resolve('dist-review/index.html')).href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const total = await page.locator('.card').count();
  await page.selectOption('#f-grade', '5');
  await page.selectOption('#f-kind', 'pick-picture');
  const n = await page.locator('.card:not([hidden])').count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(total);
  await expect(page.locator('#shown')).toHaveText(`Showing ${n} of ${total}`);
  await page.screenshot({ path: 'test-results/review-filters.png' });
  page.once('dialog', (d) => {
    expect(d.message()).toBe(`Approve ${n} shown questions (kind: pick-picture, grade: 5, status: undecided)?`);
    void d.accept();
  });
  await page.click('#bulk-approve');
  await expect(page.locator('#count')).toContainText(`approved ${n} / rejected 0 / undecided ${total - n}`);
  await expect(page.locator('#shown')).toHaveText(`Showing 0 of ${total}`);
  await page.reload();
  await expect(page.locator('#count')).toContainText(`approved ${n}`);
  await page.evaluate(() => localStorage.clear());
});
