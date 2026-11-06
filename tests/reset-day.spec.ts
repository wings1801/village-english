import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openStore } from '../src/store/store';
import { createMemoryStore, FALLBACK_DAY_KEY } from '../src/store/memory-store';

let n = 0;
let name = '';
beforeEach(() => {
  name = `reset-day-${++n}`;
  localStorage.removeItem(FALLBACK_DAY_KEY);
});

describe('store.resetDay', () => {
  it('same date: zeroes the day, log untouched', async () => {
    const s = await openStore(name);
    await s.putDay({ dateKey: '2026-11-07', playSeconds: 500 });
    await s.resetDay('2026-11-07');
    expect(await s.getDay()).toEqual({ dateKey: '2026-11-07', playSeconds: 0 });
    expect(await s.getDaysLog()).toEqual([]);
  });

  it('earlier stored day is appended to the log first', async () => {
    const s = await openStore(name);
    await s.putDay({ dateKey: '2026-11-06', playSeconds: 120 });
    await s.resetDay('2026-11-07');
    expect(await s.getDay()).toEqual({ dateKey: '2026-11-07', playSeconds: 0 });
    expect(await s.getDaysLog()).toEqual([{ dateKey: '2026-11-06', playSeconds: 120 }]);
  });

  it('empty earlier day is not appended', async () => {
    const s = await openStore(name);
    await s.resetDay('2026-11-07');
    expect(await s.getDay()).toEqual({ dateKey: '2026-11-07', playSeconds: 0 });
    expect(await s.getDaysLog()).toEqual([]);
  });

  it('future stored day is discarded and later log entries are dropped', async () => {
    const s = await openStore(name);
    await s.putDay({ dateKey: '2026-11-03', playSeconds: 10 });
    await s.putDay({ dateKey: '2026-11-04', playSeconds: 20 });
    await s.putDay({ dateKey: '2026-11-09', playSeconds: 30 });
    await s.putDay({ dateKey: '2026-12-01', playSeconds: 99 }); // log: 03, 04, 09 ; day: 12-01
    await s.resetDay('2026-11-05');
    expect(await s.getDay()).toEqual({ dateKey: '2026-11-05', playSeconds: 0 });
    expect(await s.getDaysLog()).toEqual([
      { dateKey: '2026-11-03', playSeconds: 10 },
      { dateKey: '2026-11-04', playSeconds: 20 },
    ]);
  });

  it('rejects an invalid today and writes nothing', async () => {
    const s = await openStore(name);
    await s.putDay({ dateKey: '2026-11-07', playSeconds: 5 });
    for (const bad of ['', '2026-1-1', 'tomorrow', '2026-11-07T00:00']) {
      await expect(s.resetDay(bad)).rejects.toThrow('invalid today');
    }
    expect(await s.getDay()).toEqual({ dateKey: '2026-11-07', playSeconds: 5 });
  });

  // Note: the failure is injected via beforeWrite, i.e. before the transaction starts (same limitation as the putDay tests).
  it('quota failure rejects with the same error, latches health, changes nothing', async () => {
    const quota = new DOMException('full', 'QuotaExceededError');
    let fail = false;
    const s = await openStore(name, {
      beforeWrite: () => {
        if (fail) throw quota;
      },
    });
    await s.putDay({ dateKey: '2026-11-06', playSeconds: 60 });
    fail = true;
    await expect(s.resetDay('2026-11-07')).rejects.toBe(quota);
    expect(await s.health()).toEqual({ ok: false, reason: 'quota' });
    fail = false;
    expect(await s.getDay()).toEqual({ dateKey: '2026-11-06', playSeconds: 60 });
    expect(await s.getDaysLog()).toEqual([]);
  });
});

describe('memory store resetDay', () => {
  it('sets the day to zero and mirrors it to localStorage', async () => {
    const m = createMemoryStore();
    await m.putDay({ dateKey: '2026-11-06', playSeconds: 42 });
    await m.resetDay('2026-11-07');
    expect(await m.getDay()).toEqual({ dateKey: '2026-11-07', playSeconds: 0 });
    expect(await createMemoryStore().getDay()).toEqual({ dateKey: '2026-11-07', playSeconds: 0 });
  });
  it('same date zeroes; future-dated day is discarded', async () => {
    const m = createMemoryStore();
    await m.putDay({ dateKey: '2026-11-07', playSeconds: 42 });
    await m.resetDay('2026-11-07');
    expect((await m.getDay()).playSeconds).toBe(0);
    await m.putDay({ dateKey: '2027-01-01', playSeconds: 9 });
    await m.resetDay('2026-11-07');
    expect(await m.getDay()).toEqual({ dateKey: '2026-11-07', playSeconds: 0 });
  });
  it('rejects an invalid today', async () => {
    const m = createMemoryStore();
    await expect(m.resetDay('x')).rejects.toThrow('invalid today');
  });
});
