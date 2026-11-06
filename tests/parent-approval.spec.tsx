import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { cleanup, screen } from '@testing-library/preact';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store';
import { loadApprovalSummary } from '../src/ui/parent-data';
import { vi as t } from '../src/ui/parent-strings';
import { resetPinGuard } from '../src/ui/pin-gate';
import { mountParent, seedPin, unlockUi } from './parent-helpers';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('loadApprovalSummary', () => {
  const good = { '5': { parent: 124, ai: 3, total: 225 }, '4': { parent: 0, ai: 0, total: 216 } };
  it('reads content/approval-summary.json', async () => {
    const f = vi.fn(async () => json(good));
    expect(await loadApprovalSummary(f as unknown as typeof fetch, '/base/')).toEqual(good);
    expect(f).toHaveBeenCalledWith('/base/content/approval-summary.json');
  });
  it.each([
    ['404', async () => json({}, 404)],
    ['network error', async () => { throw new Error('offline'); }],
    ['not JSON', async () => new Response('<html>', { status: 200 })],
    ['array', async () => json([1])],
    ['missing grade', async () => json({ '5': good['5'] })],
    ['negative count', async () => json({ ...good, '4': { parent: -1, ai: 0, total: 1 } })],
    ['non-integer', async () => json({ ...good, '4': { parent: 'x', ai: 0, total: 1 } })],
  ])('fails safe (%s) -> null', async (_n, f) => {
    expect(await loadApprovalSummary(f as unknown as typeof fetch, '/')).toBeNull();
  });
  it('does not throw when fetch is missing', async () => {
    vi.stubGlobal('fetch', undefined);
    expect(await loadApprovalSummary(undefined, '/')).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('dashboard: who approved the questions', () => {
  let n = 0;
  let store: Store;
  let summary: unknown;
  beforeEach(async () => {
    store = await openStore(`parent-approval-${++n}`);
    resetPinGuard();
    window.location.hash = '#/parent';
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('approval-summary.json') && summary !== undefined ? json(summary) : new Response('', { status: 404 }),
    );
  });
  afterEach(() => {
    cleanup();
    store.close();
    vi.unstubAllGlobals();
    window.location.hash = '';
    summary = undefined;
  });

  it('shows parent/AI counts per grade and a calm notice when AI-approved questions exist', async () => {
    summary = { '5': { parent: 124, ai: 40, total: 225 }, '4': { parent: 0, ai: 0, total: 216 } };
    await seedPin(store);
    mountParent(store);
    await unlockUi();
    const rows = screen.getAllByTestId('content-row');
    expect(rows[0].textContent).toContain(t.content.byWho(124, 40));
    expect(rows[1].textContent).toContain(t.content.byWho(0, 0));
    expect(screen.getByTestId('content-ai-notice').textContent).toContain(t.content.aiNotice);
    expect(t.content.aiNotice).toContain('AI-approved');
    expect(t.content.byWho(1, 2)).toBe('1 câu do bạn duyệt, 2 câu do AI duyệt (chưa có người xem)');
  });

  it('shows no notice when no question is AI-approved', async () => {
    summary = { '5': { parent: 124, ai: 0, total: 225 }, '4': { parent: 0, ai: 0, total: 216 } };
    await seedPin(store);
    mountParent(store);
    await unlockUi();
    expect(screen.queryByTestId('content-ai-notice')).toBeNull();
  });

  it('shows nothing extra when the summary is unavailable', async () => {
    await seedPin(store);
    mountParent(store);
    await unlockUi();
    expect(screen.getAllByTestId('content-row')).toHaveLength(2);
    expect(screen.queryByTestId('content-ai-notice')).toBeNull();
    expect(screen.getAllByTestId('content-row')[0].textContent).not.toContain('AI duyệt');
  });
});
