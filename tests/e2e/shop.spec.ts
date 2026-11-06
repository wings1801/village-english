import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The service worker precaches content; block it so page.route can serve the fixture.
test.use({ serviceWorkers: 'block' });

interface Q {
  id: string;
  kind: string;
  answer: string;
}
const fixture: Q[] = JSON.parse(readFileSync('tests/fixtures/content-5.json', 'utf8'));
const byId = new Map(fixture.map((q) => [q.id, q]));

async function answerCorrectly(page: Page) {
  const el = page.getByTestId('question');
  await expect(el).toBeVisible();
  const q = byId.get((await el.getAttribute('data-question-id'))!)!;
  if (q.kind === 'letter-tiles') {
    for (const ch of q.answer) {
      await page.locator('[data-testid=tile]:not([disabled])', { hasText: new RegExp(`^${ch}$`) }).first().click();
    }
    return q;
  }
  const choices = page.getByTestId('choice');
  const n = await choices.count();
  for (let i = 0; i < n; i++) {
    if ((await choices.nth(i).getAttribute('data-choice-id')) === q.answer) {
      await choices.nth(i).click();
      return q;
    }
  }
  throw new Error('no choice found');
}

async function earnBells(page: Page): Promise<number> {
  await page.route('**/content/5.json', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }),
  );
  await page.goto('./');
  await page.getByTestId('villager').first().click();
  await page.getByText('はじめる').click();
  for (let i = 0; i < 5; i++) {
    const q = await answerCorrectly(page);
    if (i < 4) await expect(page.getByTestId('question')).not.toHaveAttribute('data-question-id', q.id);
  }
  const summary = page.getByTestId('summary-bells');
  await expect(summary).toBeVisible();
  const earned = Number(await summary.textContent());
  await page.getByText('むらへもどる').click();
  await expect(page.getByTestId('bells')).toHaveText(String(earned));
  return earned;
}

const settled = (page: Page) =>
  expect.poll(() => page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))).toBe(true);

test.setTimeout(90_000);
test('earn bells, buy an item, decorate, reload: the decor stays in the village', async ({ page }) => {
  const earned = await earnBells(page);
  expect(earned).toBeGreaterThanOrEqual(20);

  await page.screenshot({ path: 'test-results/shop-village-buttons.png' });
  await page.getByLabel('おみせ').click();
  await expect(page).toHaveURL(/#\/shop$/);
  await expect(page.getByTestId('shop-item')).toHaveCount(24);
  await expect(page.getByTestId('bells')).toHaveText(String(earned));
  await settled(page);
  await page.screenshot({ path: 'test-results/shop.png' });
  await page.screenshot({ path: 'test-results/shop-full.png', fullPage: true });

  // all buttons are at least 72px tall
  const heights = await page.getByTestId('buy').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(72);

  // too expensive: neutral message, bells unchanged
  // The dimmed button is aria-disabled (so a tap can explain). Playwright treats aria-disabled as
  // "not enabled" and would wait forever, so force the click; a real finger tap is not blocked.
  await page.locator('[data-testid=shop-item][data-decor-id=fountain] button').click({ force: true });
  await expect(page.getByText('ベルが たりないよ')).toBeVisible();
  await expect(page.getByTestId('bells')).toHaveText(String(earned));

  const row = page.locator('[data-testid=shop-item][data-decor-id=watering_can]');
  await row.locator('button').click();
  await expect(page.getByText('かったよ！')).toBeVisible();
  await expect(row.locator('button')).toHaveText('もっているよ');
  await expect(page.getByTestId('bells')).toHaveText(String(earned - 20));
  await page.screenshot({ path: 'test-results/shop-bought.png' });

  await page.getByRole('button', { name: 'もどる', exact: true }).click();
  await page.getByLabel('かざる').click();
  await expect(page).toHaveURL(/#\/decorate$/);
  await settled(page);
  await page.screenshot({ path: 'test-results/decorate-empty.png' });
  await page.getByTestId('tray-item').click();
  const scene = page.getByTestId('decor-scene');
  const box = (await scene.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.4);
  await expect(page.getByTestId('decor')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/decorate.png' });
  await page.getByTestId('done').click();
  await expect(page.getByTestId('village')).toBeVisible();
  await expect(page.getByTestId('decor')).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId('decor')).toHaveCount(1);
  await settled(page);
  await page.screenshot({ path: 'test-results/village-with-decor.png' });

  // shop still shows the item as owned after reload
  await page.goto('./#/shop');
  await expect(page.locator('[data-testid=shop-item][data-decor-id=watering_can] button')).toHaveText('もっているよ');
});

for (const [w, h, name] of [
  [1366, 1024, 'landscape'],
  [1024, 1366, 'portrait'],
] as const) {
  test(`village buttons and villagers do not overlap (${name})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    // The villagers rotate daily; check every rotation (11 consecutive days cover all 11 villagers).
    const days = Array.from({ length: 11 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}T12:00:00`);
    const seen = new Set<string>();
    for (const [di, day] of days.entries()) {
      await page.clock.setFixedTime(new Date(day));
      await page.goto('./');
      await expect(page.getByTestId('villager').first()).toBeVisible();
      await settled(page);
      if (di === 0 || di === 1) await page.screenshot({ path: `test-results/village-${name}${di === 0 ? '' : '-day2'}.png` });
      for (const id of await page.locator('[data-testid=villager]').evaluateAll((els) => els.map((e) => e.getAttribute('data-villager-id')!))) seen.add(id);
      await checkNoOverlap(page, w, h, name);
    }
    expect(seen.size).toBe(11);
  });
}

async function checkNoOverlap(page: import('@playwright/test').Page, w: number, h: number, _name: string) {
    const rects = async (sel: string) =>
      page.locator(sel).evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { name: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim(), l: r.left, t: r.top, r: r.right, b: r.bottom };
        }),
      );
    const villagers = await rects('[data-testid=villager]');
    const others = await rects('.btn-round, .footer-link, [data-testid=bells]');
    expect(villagers.length).toBe(6);
    expect(others.length).toBeGreaterThanOrEqual(5); // map, shop, decorate, parent, credits, bells
    for (const v of villagers) {
      for (const o of others) {
        const overlap = v.l < o.r && o.l < v.r && v.t < o.b && o.t < v.b;
        expect(overlap, `${v.name} overlaps ${o.name} at ${w}x${h}`).toBe(false);
      }
    }
    // the round buttons are real touch targets
    for (const o of await rects('.shop-btn, .decorate-btn, .map-btn')) {
      expect(Math.min(o.r - o.l, o.b - o.t)).toBeGreaterThanOrEqual(72);
    }
}

test('shop keeps the credits link clear of the grid; decorate has its own', async ({ page }) => {
  await page.goto('./#/shop');
  await expect(page.getByTestId('shop-item')).toHaveCount(24);
  const link = page.locator('.footer-link');
  await expect(link).toBeVisible();
  const grid = await page.locator('.shop-scroll').boundingBox();
  const lb = (await link.boundingBox())!;
  expect(lb.y).toBeGreaterThanOrEqual(grid!.y + grid!.height);
  await page.goto('./#/decorate');
  const own = page.locator('a.credits-link');
  await expect(own).toBeVisible();
  expect((await own.boundingBox())!.height).toBeGreaterThanOrEqual(56);
});
