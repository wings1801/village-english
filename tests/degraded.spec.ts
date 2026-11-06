import { beforeEach, describe, expect, it } from 'vitest';
import { getDegraded, markDegraded, resetDegraded } from '../src/store/degraded';
import { createMemoryStore, FALLBACK_DAY_KEY } from '../src/store/memory-store';

beforeEach(() => {
  resetDegraded();
  localStorage.removeItem(FALLBACK_DAY_KEY);
});

describe('degraded', () => {
  it('is null until marked, first reason wins', () => {
    expect(getDegraded()).toBeNull();
    markDegraded('a');
    markDegraded('b');
    expect(getDegraded()).toBe('a');
  });
});

describe('memory store day mirror', () => {
  it('putDay is mirrored to localStorage and read back on creation', async () => {
    await createMemoryStore().putDay({ dateKey: '2026-11-06', playSeconds: 42 });
    expect(JSON.parse(localStorage.getItem(FALLBACK_DAY_KEY)!)).toEqual({ dateKey: '2026-11-06', playSeconds: 42 });
    expect(await createMemoryStore().getDay()).toEqual({ dateKey: '2026-11-06', playSeconds: 42 });
  });
  it('ignores corrupt stored data', async () => {
    localStorage.setItem(FALLBACK_DAY_KEY, '{"dateKey":1}');
    expect(await createMemoryStore().getDay()).toEqual({ dateKey: '', playSeconds: 0 });
  });
});

describe('memory store shop parity', () => {
  it('buyDecor follows the same rules', async () => {
    const m = createMemoryStore();
    expect(await m.getOwned()).toEqual([]);
    expect(await m.getPlaced()).toEqual([]);
    await m.addBells(50);
    expect(await m.buyDecor('a', 20)).toEqual({ ok: true, bells: 30, owned: ['a'] });
    expect(await m.buyDecor('a', 20)).toEqual({ ok: false, bells: 30, owned: ['a'] });
    expect(await m.buyDecor('b', 31)).toEqual({ ok: false, bells: 30, owned: ['a'] });
    expect(await m.buyDecor('b', -1)).toEqual({ ok: false, bells: 30, owned: ['a'] });
    expect(await m.buyDecor('b', 1.5)).toEqual({ ok: false, bells: 30, owned: ['a'] });
    expect(await m.buyDecor('', 1)).toEqual({ ok: false, bells: 30, owned: ['a'] });
    await m.putPlaced([{ decorId: 'a', x: 0.1, y: 0.2 }]);
    expect(await m.getPlaced()).toEqual([{ decorId: 'a', x: 0.1, y: 0.2 }]);
  });
});
