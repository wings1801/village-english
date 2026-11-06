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
const KINDS = ['pick-picture', 'listen-pick', 'letter-tiles', 'pick-word', 'dialogue-choice'];

async function serve(page: Page, kind?: string) {
  const body = JSON.stringify(kind ? fixture.filter((q) => q.kind === kind) : fixture);
  await page.route('**/content/5.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body }));
}

async function currentQuestion(page: Page): Promise<Q> {
  const el = page.getByTestId('question');
  await expect(el).toBeVisible();
  const id = (await el.getAttribute('data-question-id'))!;
  return byId.get(id)!;
}

async function tapTiles(page: Page, word: string) {
  for (const ch of word) {
    await page.locator('[data-testid=tile]:not([disabled])', { hasText: new RegExp(`^${ch}$`) }).first().click();
  }
}

async function answer(page: Page, q: Q, correct: boolean) {
  if (q.kind === 'letter-tiles') {
    await tapTiles(page, correct ? q.answer : [...q.answer].reverse().join(''));
    return;
  }
  const choices = page.getByTestId('choice');
  const n = await choices.count();
  for (let i = 0; i < n; i++) {
    const id = await choices.nth(i).getAttribute('data-choice-id');
    if ((id === q.answer) === correct) {
      await choices.nth(i).click();
      return;
    }
  }
  throw new Error('no choice found');
}

test('complete a quest with a wrong try first; bells persist after reload', async ({ page }) => {
  await serve(page);
  await page.goto('./');
  await page.getByTestId('villager').first().click();
  await expect(page).toHaveURL(/#\/quest\//);
  await page.getByText('はじめる').click();

  for (let i = 0; i < 5; i++) {
    const q = await currentQuestion(page);
    if (i === 0) {
      await answer(page, q, false);
      await expect(page.getByText('もういちど！')).toBeVisible();
      await expect(page.getByTestId('quest-villager')).toHaveAttribute('data-pose', 'surprised');
      await page.screenshot({ path: 'test-results/quest-wrong-again.png' });
      expect((await page.getByTestId('question').getAttribute('data-question-id'))).toBe(q.id);
    }
    await answer(page, q, true);
    await expect(page.getByTestId('cheer')).toBeVisible();
    if (i === 1) await page.screenshot({ path: 'test-results/quest-cheer.png' });
    if (i < 4) {
      await expect(page.getByTestId('question')).not.toHaveAttribute('data-question-id', q.id);
    }
  }

  const summaryBells = page.getByTestId('summary-bells');
  await expect(summaryBells).toBeVisible();
  const earned = Number(await summaryBells.textContent());
  expect(earned).toBeGreaterThan(0);

  await page.getByText('むらへもどる').click();
  await expect(page.getByTestId('bells')).toHaveText(String(earned));
  await page.reload();
  await expect(page.getByTestId('bells')).toHaveText(String(earned));
});

for (const kind of KINDS) {
  test(`screenshot: ${kind}`, async ({ page }) => {
    await serve(page, kind);
    await page.goto('./#/quest/hana');
    await page.getByText('はじめる').click();
    await currentQuestion(page);
    await expect(page.locator('.quest-main img').first()).toBeVisible();
    // auto-wait: every image on the page is loaded and decoded
    await expect
      .poll(() => page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0)))
      .toBe(true);
    await page.screenshot({ path: `test-results/quest-${kind}.png` });
    // every choice/tile target is at least 72px
    const boxes = await page.locator('[data-testid=choice], [data-testid=tile]').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return Math.min(r.width, r.height);
      }),
    );
    for (const b of boxes) expect(b).toBeGreaterThanOrEqual(72);
  });
}

test('intro and summary screenshots', async ({ page }) => {
  await serve(page);
  await page.goto('./#/quest/momo');
  await expect(page.getByText('はじめる')).toBeVisible();
  await page.screenshot({ path: 'test-results/quest-intro.png' });
  await page.getByText('はじめる').click();
  for (let i = 0; i < 5; i++) {
    const q = await currentQuestion(page);
    await answer(page, q, true);
    if (i < 4) await expect(page.getByTestId('question')).not.toHaveAttribute('data-question-id', q.id);
  }
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0)))
    .toBe(true);
  await page.screenshot({ path: 'test-results/quest-summary.png' });
});
