import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { openStore, validateBackupShape } from '../src/store/store';
import type { WordProgress } from '../src/domain/types';

let n = 0;
let name = '';
beforeEach(() => {
  name = `test-db-${++n}`;
});

const wp = (wordId: string, box: WordProgress['box'] = 2): WordProgress => ({
  wordId,
  box,
  dueDate: '2026-11-07',
  seen: 3,
  wrong: 1,
});

describe('store', () => {
  it('fresh store has defaults', async () => {
    const s = await openStore(name);
    expect(await s.getBells()).toBe(0);
    expect((await s.getSettings()).dailyLimitSeconds).toBe(1800);
    expect(await s.getSettings()).toEqual({ dailyLimitSeconds: 1800 });
    expect(await s.allProgress()).toEqual([]);
    expect(await s.getDay()).toEqual({ dateKey: '', playSeconds: 0 });
    expect(await s.getDaysLog()).toEqual([]);
    expect(await s.health()).toEqual({ ok: true });
  });

  it('close() is idempotent and a new openStore on the same name works', async () => {
    const s = await openStore(name);
    await s.addBells(7);
    s.close();
    expect(() => s.close()).not.toThrow();
    const again = await openStore(name);
    expect(await again.getBells()).toBe(7);
  });

  it('works without navigator.storage', async () => {
    const orig = Object.getOwnPropertyDescriptor(navigator, 'storage');
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
    try {
      await expect(openStore(name)).resolves.toBeTruthy();
    } finally {
      if (orig) Object.defineProperty(navigator, 'storage', orig);
      else delete (navigator as unknown as Record<string, unknown>).storage;
    }
  });

  it('addBells accumulates and persists', async () => {
    const s = await openStore(name);
    expect(await s.addBells(5)).toBe(5);
    expect(await s.addBells(5)).toBe(10);
    expect(await (await openStore(name)).getBells()).toBe(10);
  });

  it('progress put/get/all', async () => {
    const s = await openStore(name);
    await s.putProgress(wp('a'));
    await s.putProgress(wp('b', 4));
    expect(await s.getProgress('b')).toEqual(wp('b', 4));
    expect(await s.getProgress('zzz')).toBeUndefined();
    expect((await s.allProgress()).length).toBe(2);
  });

  it('settings round-trip', async () => {
    const s = await openStore(name);
    await s.putSettings({ dailyLimitSeconds: 600, pinHash: 'h', pinSalt: 's' });
    expect(await s.getSettings()).toEqual({ dailyLimitSeconds: 600, pinHash: 'h', pinSalt: 's' });
  });

  it('putDay logs the finished day when dateKey changes', async () => {
    const s = await openStore(name);
    await s.putDay({ dateKey: '2026-11-05', playSeconds: 900 });
    expect(await s.getDaysLog()).toEqual([]);
    await s.putDay({ dateKey: '2026-11-05', playSeconds: 950 });
    expect(await s.getDaysLog()).toEqual([]);
    await s.putDay({ dateKey: '2026-11-06', playSeconds: 30 });
    expect(await s.getDaysLog()).toEqual([{ dateKey: '2026-11-05', playSeconds: 950 }]);
    expect(await s.getDay()).toEqual({ dateKey: '2026-11-06', playSeconds: 30 });
  });

  it('putDay log matches the spec example', async () => {
    const s = await openStore(name);
    await s.putDay({ dateKey: '2026-11-05', playSeconds: 900 });
    await s.putDay({ dateKey: '2026-11-06', playSeconds: 30 });
    expect(await s.getDaysLog()).toEqual([{ dateKey: '2026-11-05', playSeconds: 900 }]);
  });

  it('days log is capped at 400, dropping oldest', async () => {
    const s = await openStore(name);
    for (let i = 0; i < 405; i++) {
      await s.putDay({ dateKey: `d${String(i).padStart(4, '0')}`, playSeconds: i });
    }
    const log = await s.getDaysLog();
    expect(log.length).toBe(400);
    expect(log[0].dateKey).toBe('d0004');
    expect(log[399].dateKey).toBe('d0403');
  });

  it('exportAll then importAll round-trips into a new store', async () => {
    const a = await openStore(name);
    await a.putProgress(wp('a'));
    await a.putProgress(wp('b', 5));
    await a.addBells(42);
    await a.putSettings({ dailyLimitSeconds: 900 });
    await a.putDay({ dateKey: '2026-11-05', playSeconds: 10 });
    await a.putDay({ dateKey: '2026-11-06', playSeconds: 20 });
    const backup = await a.exportAll();
    expect(backup.version).toBe(1);
    expect(backup.bells).toBe(42);

    const b = await openStore(`${name}-b`);
    await b.importAll(JSON.parse(JSON.stringify(backup)));
    expect((await b.allProgress()).sort((x, y) => x.wordId.localeCompare(y.wordId))).toEqual([
      wp('a'),
      wp('b', 5),
    ]);
    expect(await b.getBells()).toBe(42);
    expect(await b.getSettings()).toEqual({ dailyLimitSeconds: 900 });
    expect(await b.getDay()).toEqual({ dateKey: '2026-11-06', playSeconds: 20 });
    expect(await b.getDaysLog()).toEqual([{ dateKey: '2026-11-05', playSeconds: 10 }]);
  });

  it('importAll replaces existing data', async () => {
    const a = await openStore(name);
    const backup = await a.exportAll();
    const b = await openStore(`${name}-b`);
    await b.putProgress(wp('old'));
    await b.addBells(7);
    await b.importAll(backup);
    expect(await b.allProgress()).toEqual([]);
    expect(await b.getBells()).toBe(0);
  });

  it('importAll rejects a bad version and leaves data unchanged', async () => {
    const s = await openStore(name);
    await s.addBells(3);
    await expect(s.importAll({ version: 2 })).rejects.toThrow(/^invalid backup:/);
    await expect(s.importAll(null)).rejects.toThrow(/^invalid backup:/);
    expect(await s.getBells()).toBe(3);
  });

  it('importAll with a malformed entry deep in the file writes nothing', async () => {
    const s = await openStore(name);
    await s.addBells(3);
    await s.putProgress(wp('keep'));
    const good = await (await openStore(`${name}-src`)).exportAll();
    const bad = {
      ...good,
      bells: 99,
      progress: [wp('x'), wp('y'), { ...wp('z'), box: 6 }],
    };
    await expect(s.importAll(bad)).rejects.toThrow(/^invalid backup:/);
    expect(await s.getBells()).toBe(3);
    expect(await s.allProgress()).toEqual([wp('keep')]);
    const bad2 = { ...good, daysLog: [{ dateKey: 'a', playSeconds: 1 }, { dateKey: 'b' }] };
    await expect(s.importAll(bad2)).rejects.toThrow(/^invalid backup:/);
    expect(await s.getBells()).toBe(3);
  });

  it('quota failure marks health and rejects with the same error', async () => {
    const quota = new DOMException('full', 'QuotaExceededError');
    let fail = false;
    const s = await openStore(name, {
      beforeWrite: () => {
        if (fail) throw quota;
      },
    });
    expect(await s.health()).toEqual({ ok: true });
    await s.addBells(1);
    fail = true;
    await expect(s.addBells(1)).rejects.toBe(quota);
    expect(await s.health()).toEqual({ ok: false, reason: 'quota' });
    await expect(s.putProgress(wp('a'))).rejects.toBe(quota);
    fail = false;
    expect(await s.getBells()).toBe(1);
  });
  it('currentGrade round-trips through export/import', async () => {
    const a = await openStore(`${name}-src`);
    await a.putSettings({ dailyLimitSeconds: 600, currentGrade: '4' });
    expect((await a.getSettings()).currentGrade).toBe('4');
    const backup = await a.exportAll();
    const b = await openStore(name);
    await b.importAll(JSON.parse(JSON.stringify(backup)));
    expect(await b.getSettings()).toEqual({ dailyLimitSeconds: 600, currentGrade: '4' });
  });

  it('importAll rejects an invalid currentGrade', async () => {
    const good = await (await openStore(`${name}-src`)).exportAll();
    const s = await openStore(name);
    const bad = { ...good, settings: { ...good.settings, currentGrade: '9' } };
    await expect(s.importAll(bad)).rejects.toThrow(/^invalid backup:/);
    await expect(s.importAll({ ...good, settings: { ...good.settings, currentGrade: 5 } })).rejects.toThrow(/^invalid backup:/);
  });

  describe('shop and decor', () => {
    it('fresh store: nothing owned or placed', async () => {
      const s = await openStore(name);
      expect(await s.getOwned()).toEqual([]);
      expect(await s.getPlaced()).toEqual([]);
    });

    it('buyDecor deducts, appends in order and persists', async () => {
      const s = await openStore(name);
      await s.addBells(100);
      expect(await s.buyDecor('fountain', 30)).toEqual({ ok: true, bells: 70, owned: ['fountain'] });
      expect(await s.buyDecor('campfire', 20)).toEqual({ ok: true, bells: 50, owned: ['fountain', 'campfire'] });
      expect(await s.getBells()).toBe(50);
      expect(await (await openStore(name)).getOwned()).toEqual(['fountain', 'campfire']);
    });

    it('buyDecor can spend exactly all bells', async () => {
      const s = await openStore(name);
      await s.addBells(20);
      expect(await s.buyDecor('a', 20)).toEqual({ ok: true, bells: 0, owned: ['a'] });
    });

    it('buyDecor fails without writing for insufficient bells, owned, and bad input', async () => {
      const s = await openStore(name);
      await s.addBells(50);
      await s.buyDecor('a', 10);
      const same = { ok: false, bells: 40, owned: ['a'] };
      expect(await s.buyDecor('b', 41)).toEqual(same);
      expect(await s.buyDecor('a', 10)).toEqual(same);
      expect(await s.buyDecor('b', -5)).toEqual(same);
      expect(await s.buyDecor('b', NaN)).toEqual(same);
      expect(await s.buyDecor('b', 2.5)).toEqual(same);
      expect(await s.buyDecor('b', Infinity)).toEqual(same);
      expect(await s.buyDecor('', 10)).toEqual(same);
      expect(await s.buyDecor(7 as unknown as string, 10)).toEqual(same);
      expect(await s.getBells()).toBe(40);
      expect(await s.getOwned()).toEqual(['a']);
    });

    it('concurrent double buy of the same item succeeds exactly once', async () => {
      const s = await openStore(name);
      await s.addBells(100);
      const rs = await Promise.all([s.buyDecor('x', 60), s.buyDecor('x', 60), s.buyDecor('x', 60)]);
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(await s.getBells()).toBe(40);
      expect(await s.getOwned()).toEqual(['x']);
    });

    it('concurrent buys of different items never overspend', async () => {
      const s = await openStore(name);
      await s.addBells(100);
      const rs = await Promise.all([s.buyDecor('a', 60), s.buyDecor('b', 60)]);
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(await s.getBells()).toBe(40);
    });

    it('quota failure in buyDecor latches health and changes nothing', async () => {
      const quota = new DOMException('full', 'QuotaExceededError');
      let fail = false;
      const s = await openStore(name, {
        beforeWrite: () => {
          if (fail) throw quota;
        },
      });
      await s.addBells(100);
      fail = true;
      await expect(s.buyDecor('a', 10)).rejects.toBe(quota);
      await expect(s.putPlaced([])).rejects.toBe(quota);
      expect(await s.health()).toEqual({ ok: false, reason: 'quota' });
      fail = false;
      expect(await s.getBells()).toBe(100);
      expect(await s.getOwned()).toEqual([]);
    });

    it('buyDecor treats corrupt stored bells/owned as 0 / [] and never writes NaN', async () => {
      const s = await openStore(name);
      const raw = await openDB(name, 1);
      await raw.put('kv', NaN, 'bells');
      await raw.put('kv', 'oops', 'owned');
      expect(await s.buyDecor('a', 10)).toEqual({ ok: false, bells: 0, owned: [] });
      expect(await s.buyDecor('a', 0)).toEqual({ ok: true, bells: 0, owned: ['a'] });
      expect(await raw.get('kv', 'bells')).toBe(0);
      expect(await raw.get('kv', 'owned')).toEqual(['a']);
      raw.close();
    });

    it('putPlaced/getPlaced round trip', async () => {
      const s = await openStore(name);
      const p = [{ decorId: 'a', x: 0.2, y: 0.9 }];
      await s.putPlaced(p);
      expect(await s.getPlaced()).toEqual(p);
      expect(await (await openStore(name)).getPlaced()).toEqual(p);
    });

    it('export/import round-trips owned and placed', async () => {
      const a = await openStore(`${name}-src`);
      await a.addBells(100);
      await a.buyDecor('fountain', 30);
      await a.putPlaced([{ decorId: 'fountain', x: 0.5, y: 0.5 }]);
      const backup = JSON.parse(JSON.stringify(await a.exportAll()));
      expect(backup.owned).toEqual(['fountain']);
      const b = await openStore(name);
      await b.importAll(backup);
      expect(await b.getOwned()).toEqual(['fountain']);
      expect(await b.getPlaced()).toEqual([{ decorId: 'fountain', x: 0.5, y: 0.5 }]);
      expect(await b.getBells()).toBe(70);
    });

    it('importAll rejects invalid placed entries', async () => {
      const good = await (await openStore(`${name}-src`)).exportAll();
      const s = await openStore(name);
      const badPlaced = [
        [{ decorId: 3, x: 0.5, y: 0.5 }],
        [{ decorId: 'a', x: 1.5, y: 0.5 }],
        [{ decorId: 'a', x: 0.5, y: -0.1 }],
        [{ decorId: 'a', x: '0.5', y: 0.5 }],
        [{ decorId: 'a', x: NaN, y: 0.5 }],
        ['a'],
      ];
      for (const placed of badPlaced) {
        await expect(s.importAll({ ...good, placed })).rejects.toThrow(/^invalid backup:/);
      }
    });
  });
});

describe('validateBackupShape', () => {
  const good = {
    version: 1, exportedAt: 'x', progress: [], bells: 0, owned: [], placed: [],
    day: { dateKey: '', playSeconds: 0 }, daysLog: [], settings: { dailyLimitSeconds: 1800 },
  };
  it('accepts a good backup', () => expect(validateBackupShape(good)).toEqual({ ok: true }));
  it.each([
    [null, 'not an object'],
    [{ ...good, version: 2 }, 'unsupported version'],
    [{ ...good, progress: 'x' }, 'progress'],
    [{ ...good, bells: 'x' }, 'bells'],
    [{ ...good, settings: { dailyLimitSeconds: 1, currentGrade: 'zz' } }, 'settings'],
  ])('rejects %j with reason %s', (v, reason) => expect(validateBackupShape(v)).toEqual({ ok: false, reason }));
});
