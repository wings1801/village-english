import { describe, expect, it } from 'vitest';
import { buy, placeDecor, PRICES, villagersForDay, type PlacedDecor } from '../src/domain/village';
import { DECOR } from '../src/assets/manifest';
import { ISLANDS } from '../src/domain/islands';

describe('placeDecor', () => {
  it('adds a new entry without mutating the input', () => {
    const before: PlacedDecor[] = [];
    const after = placeDecor(before, 'fountain', 0.5, 0.25);
    expect(after).toEqual([{ decorId: 'fountain', x: 0.5, y: 0.25 }]);
    expect(before).toEqual([]);
    expect(after).not.toBe(before);
  });
  it('clamps to 0..1', () => {
    expect(placeDecor([], 'a', -3, 9)).toEqual([{ decorId: 'a', x: 0, y: 1 }]);
  });
  it('replaces the same decorId instead of duplicating', () => {
    const start = [{ decorId: 'a', x: 0.1, y: 0.1 }, { decorId: 'b', x: 0.2, y: 0.2 }];
    const next = placeDecor(start, 'a', 0.9, 0.8);
    expect(next).toHaveLength(2);
    expect(next.find((p) => p.decorId === 'a')).toEqual({ decorId: 'a', x: 0.9, y: 0.8 });
    expect(start[0]).toEqual({ decorId: 'a', x: 0.1, y: 0.1 });
  });
  it('treats NaN as 0', () => {
    expect(placeDecor([], 'a', NaN, 0.5)).toEqual([{ decorId: 'a', x: 0, y: 0.5 }]);
  });
});

describe('ISLANDS', () => {
  it('has 7 islands in order', () => {
    expect(ISLANDS.map((i) => i.grade)).toEqual(['5', '4', '3', 'p2', '2', 'p1', '1']);
  });
  it('unlocks only 5 and 4', () => {
    expect(ISLANDS.filter((i) => i.unlocked).map((i) => i.grade)).toEqual(['5', '4']);
  });
  it('labels avoid Eiken wording', () => {
    for (const i of ISLANDS) expect(i.labelJa).not.toMatch(/eiken|英検/i);
  });
});

describe('PRICES and buy', () => {
  it('PRICES has exactly the DECOR ids, integers within 20..200', () => {
    expect(Object.keys(PRICES).sort()).toEqual(DECOR.map((d) => d.id).sort());
    for (const v of Object.values(PRICES)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(20);
      expect(v).toBeLessThanOrEqual(200);
    }
    expect(Math.min(...Object.values(PRICES))).toBeLessThanOrEqual(50);
  });
  it('buys when affordable, keeping order', () => {
    const r = buy({ bells: 100, owned: ['a'] }, 'watering_can');
    expect(r).toEqual({ ok: true, bells: 100 - PRICES.watering_can, owned: ['a', 'watering_can'] });
  });
  it('insufficient bells: not ok and unchanged', () => {
    expect(buy({ bells: 10, owned: [] }, 'fountain')).toEqual({ ok: false, bells: 10, owned: [] });
  });
  it('already owned is rejected', () => {
    expect(buy({ bells: 500, owned: ['fountain'] }, 'fountain')).toEqual({ ok: false, bells: 500, owned: ['fountain'] });
  });
  it('unknown decor is rejected', () => {
    expect(buy({ bells: 500, owned: [] }, 'nope')).toEqual({ ok: false, bells: 500, owned: [] });
  });
});

describe('villagersForDay', () => {
  const all = Array.from({ length: 11 }, (_, i) => ({ id: `v${i}` }));
  const ids = (l: { id: string }[]) => l.map((v) => v.id);

  it('returns 6 villagers by default, no duplicates', () => {
    const r = villagersForDay('2026-11-07', all);
    expect(r).toHaveLength(6);
    expect(new Set(ids(r)).size).toBe(6);
  });

  it('is deterministic for the same date and changes with the day', () => {
    expect(ids(villagersForDay('2026-11-07', all))).toEqual(ids(villagersForDay('2026-11-07', all)));
    expect(ids(villagersForDay('2026-11-07', all))).not.toEqual(ids(villagersForDay('2026-11-08', all)));
  });

  it('every one of the 11 appears within 11 consecutive days', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 11; d++) for (const v of villagersForDay(`2026-12-${String(d).padStart(2, '0')}`, all)) seen.add(v.id);
    expect(seen.size).toBe(11);
  });

  it('falls back to the first 6 for an invalid dateKey', () => {
    for (const bad of ['', 'not-a-date', '2026-13-45', '2026/11/07', '2026-02-30']) {
      expect(ids(villagersForDay(bad, all))).toEqual(ids(all.slice(0, 6)));
    }
  });

  it('copes with fewer villagers than the count and does not mutate the input', () => {
    const few = all.slice(0, 4);
    const copy = [...few];
    expect(villagersForDay('2026-11-07', few)).toHaveLength(4);
    expect(few).toEqual(copy);
    expect(villagersForDay('2026-11-07', [])).toEqual([]);
  });
});
