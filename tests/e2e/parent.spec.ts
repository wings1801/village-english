import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { vi as t } from '../../src/ui/parent-strings';

// Same style as the other specs: a fresh context per test (empty IndexedDB); no service worker needed.
test.use({ serviceWorkers: 'block' });

const PIN = '2580';

async function tap(page: Page, digits: string) {
  for (const d of digits) await page.locator(`[data-digit="${d}"]`).click();
}

/** Village -> gear -> arithmetic -> create PIN twice -> dashboard. */
async function createPin(page: Page, pin = PIN) {
  await page.goto('./');
  await expect(page.getByTestId('village-bg')).toBeVisible();
  await page.getByLabel('おうちのひと').click();
  await expect(page).toHaveURL(/#\/parent$/);
  const q = (await page.getByTestId('arith-question').textContent())!;
  const m = /(\d+) × (\d+)/.exec(q)!;
  await tap(page, String(Number(m[1]) * Number(m[2])));
  await page.getByTestId('pad-enter').click();
  await expect(page.getByTestId('create-prompt')).toHaveText(t.create.enterNew);
  await tap(page, pin);
  await expect(page.getByTestId('create-prompt')).toHaveText(t.create.enterAgain);
  await tap(page, pin);
  await expect(page.getByTestId('parent-dash')).toBeVisible();
  await expect(page.getByTestId('sec-storage')).toBeVisible();
}

async function unlock(page: Page, pin = PIN) {
  await expect(page.getByTestId('parent-gate')).toBeVisible();
  await tap(page, pin);
  await expect(page.getByTestId('parent-dash')).toBeVisible();
}

test.setTimeout(90_000);

test('create a PIN, reload asks for it, 5 wrong PINs lock (surviving a reload), the right one unlocks later', async ({ page }) => {
  await createPin(page);
  await page.screenshot({ path: 'test-results/parent-dashboard-top.png' });
  for (const id of ['progress', 'settings', 'backup', 'storage']) {
    await page.getByTestId(`sec-${id}`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/parent-dashboard-${id}.png` });
  }
  await page.screenshot({ path: 'test-results/parent-dashboard-full.png', fullPage: true });

  // the Credits link stays reachable
  await expect(page.locator('.footer-link')).toBeVisible();

  // every dashboard button is a real touch target
  const small = await page
    .locator('.parent-dash button:visible')
    .evaluateAll((els) => els.map((e) => ({ t: e.textContent, h: e.getBoundingClientRect().height })).filter((b) => b.h < 56));
  expect(small).toEqual([]);

  await page.reload(); // unlocked state is memory only
  await expect(page.getByTestId('parent-gate')).toBeVisible();
  await expect(page.getByTestId('parent-dash')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/parent-lock.png' });

  for (let i = 0; i < 5; i++) {
    await tap(page, '1111');
    await expect(page.getByTestId('pad-dots')).toHaveAttribute('aria-label', t.keypad.dots(0, 4));
  }
  await expect(page.getByTestId('gate-msg')).toContainText(/giây/);
  await page.screenshot({ path: 'test-results/parent-locked.png' });
  await expect(page.locator('[data-digit="1"]')).toBeDisabled();
  await expect(page.getByTestId('parent-dash')).toHaveCount(0);

  await page.reload(); // the lock is persisted: a reload must NOT clear it
  await expect(page.getByTestId('parent-gate')).toBeVisible();
  await expect(page.getByTestId('gate-msg')).toContainText(/giây/);
  await expect(page.locator('[data-digit="1"]')).toBeDisabled();
  await page.screenshot({ path: 'test-results/parent-locked-after-reload.png' });
  await expect(page.locator('[data-digit="2"]')).toBeDisabled(); // the correct PIN cannot even be typed
  await expect(page.getByTestId('parent-dash')).toHaveCount(0);

  // stand in for "60 s later": drop the persisted lock, then the right PIN works
  await page.evaluate(() => localStorage.removeItem('village-english.pinGuard'));
  await page.reload();
  await unlock(page);
  await page.getByTestId('lock').click();
  await expect(page.getByTestId('village-bg')).toBeVisible();
});

test('a key is at least 72 px; the credits link stays reachable on the lock screen', async ({ page }) => {
  await createPin(page);
  await page.reload();
  await expect(page.getByTestId('parent-gate')).toBeVisible();
  const sizes = await page.getByTestId('pad-key').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.width, r.height]));
  for (const [w, h] of sizes) {
    expect(w).toBeGreaterThanOrEqual(72);
    expect(h).toBeGreaterThanOrEqual(72);
  }
  const link = await page.locator('.footer-link').boundingBox();
  const card = await page.locator('.gate-card').boundingBox();
  expect(link!.y).toBeGreaterThanOrEqual(card!.y + card!.height);
});

test('export a backup, change it, import it back', async ({ page }) => {
  await createPin(page);
  await page.getByTestId('sec-backup').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/parent-backup-section.png' });

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  expect(download.suggestedFilename()).toMatch(/^village-english-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path, 'utf8'));
  expect(backup.version).toBe(1);
  expect(backup.settings.pinHash).toMatch(/^[0-9a-f]{64}$/);

  // a bad file changes nothing and explains itself
  await page.getByTestId('import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await expect(page.getByTestId('import-error')).toHaveText(t.backup.errNotJson);

  // restore the same file with a different bell count: confirm first, then the app reloads
  const edited = { ...backup, bells: 42 };
  await page.getByTestId('import-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(edited)) });
  const dialog = page.getByTestId('dialog-restore');
  await expect(dialog).toContainText(t.backup.restoreBody);
  await page.screenshot({ path: 'test-results/parent-restore-confirm.png' });
  await page.getByTestId('dialog-confirm').click();
  await expect(page.getByTestId('parent-gate')).toBeVisible({ timeout: 10_000 }); // app reloaded, PIN needed again
  await unlock(page);
  await page.goto('./#/');
  await expect(page.getByTestId('bells')).toHaveText('42');
});

test('portrait: the dashboard does not overflow sideways', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  await createPin(page);
  await page.screenshot({ path: 'test-results/parent-dashboard-portrait.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
